use chrono::{DateTime, Utc};
use ignore::WalkBuilder;
use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::config::Config;
use crate::db;
use crate::models::IndexedFile;
use crate::services::metadata::MetadataService;

pub struct IndexerService {
    pool: SqlitePool,
    root: PathBuf,
    is_running: Arc<RwLock<bool>>,
}

#[derive(Debug, Default)]
pub struct IndexStats {
    pub files_scanned: u64,
    pub files_indexed: u64,
    pub files_updated: u64,
    pub files_removed: u64,
    pub files_skipped: u64,
    pub errors: u64,
}

impl IndexerService {
    pub fn new(pool: SqlitePool, config: &Config) -> Self {
        Self {
            pool,
            root: config.root_path.clone(),
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the background indexer loop
    pub async fn start_background_loop(self: Arc<Self>, interval_secs: u64) {
        let interval = Duration::from_secs(interval_secs);

        info!(
            "Starting background indexer with {}s interval",
            interval_secs
        );

        loop {
            match self.run_full_index().await {
                Ok(stats) => {
                    info!(
                        "Index complete: {} scanned, {} indexed, {} skipped, {} removed, {} errors",
                        stats.files_scanned,
                        stats.files_indexed,
                        stats.files_skipped,
                        stats.files_removed,
                        stats.errors
                    );
                }
                Err(e) => {
                    error!("Indexer error: {}", e);
                }
            }

            tokio::time::sleep(interval).await;
        }
    }

    /// Run a full index of all files
    pub async fn run_full_index(&self) -> Result<IndexStats, anyhow::Error> {
        // Check if already running
        {
            let mut running = self.is_running.write().await;
            if *running {
                warn!("Indexer already running, skipping");
                return Ok(IndexStats::default());
            }
            *running = true;
        }

        let stats = self.do_index().await;

        // Mark as not running
        {
            let mut running = self.is_running.write().await;
            *running = false;
        }

        stats
    }

    async fn do_index(&self) -> Result<IndexStats, anyhow::Error> {
        let mut stats = IndexStats::default();
        let mut indexed_paths = Vec::new();

        let root = self.root.canonicalize()?;

        info!("Starting index of {:?}", root);

        for entry in WalkBuilder::new(&root)
            .follow_links(false)
            .hidden(true) // Skip hidden files (starting with .)
            .add_custom_ignore_filename(".fxignore")
            .build()
        {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    debug!("Walk error: {}", e);
                    stats.errors += 1;
                    continue;
                }
            };

            stats.files_scanned += 1;

            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(e) => {
                    debug!("Metadata error for {:?}: {}", path, e);
                    stats.errors += 1;
                    continue;
                }
            };

            // Build relative path
            let relative_path = path
                .strip_prefix(&root)
                .map(|p| format!("/{}", p.display()))
                .unwrap_or_else(|_| "/".to_string());

            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Extract media metadata if applicable
            let media_meta = if metadata.is_file() {
                MetadataService::extract(path).ok()
            } else {
                None
            };

            let mime_type = if metadata.is_file() {
                mime_guess::from_path(path).first().map(|m| m.to_string())
            } else {
                None
            };

            // Check if it's an image (to skip duration storage)
            let is_image = mime_type
                .as_ref()
                .map(|m| m.starts_with("image/"))
                .unwrap_or(false);

            let indexed_file = IndexedFile {
                id: 0, // Will be set by DB
                path: relative_path,
                name,
                is_dir: metadata.is_dir(),
                size: if metadata.is_file() {
                    Some(metadata.len() as i64)
                } else {
                    None
                },
                created_at: metadata
                    .created()
                    .ok()
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
                modified_at: metadata
                    .modified()
                    .ok()
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
                mime_type,
                width: media_meta.as_ref().and_then(|m| m.width.map(|w| w as i32)),
                height: media_meta.as_ref().and_then(|m| m.height.map(|h| h as i32)),
                // Skip duration for images (mostly 1 frame)
                duration: if is_image {
                    None
                } else {
                    media_meta.as_ref().and_then(|m| m.duration)
                },
                indexed_at: String::new(), // Set by DB
            };

            if let Err(e) = db::upsert_file(&self.pool, &indexed_file).await {
                debug!("DB error for {:?}: {}", path, e);
                stats.errors += 1;
                continue;
            }

            indexed_paths.push(indexed_file.path.clone());

            stats.files_indexed += 1;
        }

        match db::remove_missing_files(&self.pool, &indexed_paths).await {
            Ok(removed) => stats.files_removed = removed,
            Err(e) => {
                debug!("Cleanup error: {}", e);
                stats.errors += 1;
            }
        }

        Ok(stats)
    }

    /// Check if indexer is currently running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }
}
