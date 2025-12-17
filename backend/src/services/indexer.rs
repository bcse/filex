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
use crate::models::IndexedFileRow;
use crate::services::metadata::MetadataService;

const STATUS_PENDING: &str = "pending";
const STATUS_COMPLETE: &str = "complete";

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
        // Serialize runs to avoid overlapping index passes.
        let mut running = self.is_running.write().await;
        if *running {
            warn!("Indexer already running, skipping");
            return Ok(IndexStats::default());
        }
        *running = true;
        // Release lock so status checks remain non-blocking during indexing.
        drop(running);

        // Vacuum the database before starting a fresh run to reclaim space and keep pages compact.
        if let Err(err) = db::vacuum(&self.pool).await {
            warn!("VACUUM before index run failed: {}", err);
        }

        let stats = self.do_index().await;

        // Mark as not running
        let mut running = self.is_running.write().await;
        *running = false;

        stats
    }

    async fn do_index(&self) -> Result<IndexStats, anyhow::Error> {
        let mut stats = IndexStats::default();
        let mut indexed_paths = Vec::new();
        let mut pending_metadata = Vec::new();

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

            // Compute current filesystem size and mtime for change detection
            let fs_size = if metadata.is_file() {
                Some(metadata.len() as i64)
            } else {
                None
            };
            let fs_modified = metadata
                .modified()
                .ok()
                .map(|t| DateTime::<Utc>::from(t).to_rfc3339());

            let mime_type = if metadata.is_file() {
                mime_guess::from_path(path).first().map(|m| m.to_string())
            } else {
                None
            };

            let metadata_status = if metadata.is_file() {
                STATUS_PENDING
            } else {
                STATUS_COMPLETE
            };

            // Check if file is unchanged (skip expensive FFprobe extraction)
            if let Ok(Some((db_size, db_modified, db_status))) =
                db::get_file_by_path(&self.pool, &relative_path).await
            {
                if db_size == fs_size && db_modified == fs_modified {
                    indexed_paths.push(relative_path.clone());
                    stats.files_skipped += 1;

                    // If media metadata is not complete yet, queue for second pass
                    if metadata.is_file() && db_status != STATUS_COMPLETE {
                        pending_metadata.push((relative_path, path.to_path_buf(), mime_type));
                    }
                    continue;
                }
            }

            // Reset metadata for changed files; fill in second pass
            let (width, height, duration) = (None, None, None);

            let indexed_file = IndexedFileRow {
                id: 0, // Will be set by DB
                path: relative_path,
                name,
                is_dir: metadata.is_dir(),
                size: fs_size,
                created_at: metadata
                    .created()
                    .ok()
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
                modified_at: fs_modified,
                mime_type,
                width,
                height,
                duration,
                metadata_status: metadata_status.to_string(),
                indexed_at: String::new(), // Set by DB
            };

            if let Err(e) = db::upsert_file(&self.pool, &indexed_file).await {
                debug!("DB error for {:?}: {}", path, e);
                stats.errors += 1;
                continue;
            }

            // Queue media files for second pass metadata extraction
            if metadata.is_file() && metadata_status == STATUS_PENDING {
                pending_metadata.push((
                    indexed_file.path.clone(),
                    path.to_path_buf(),
                    indexed_file.mime_type.clone(),
                ));
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

        info!(
            "Starting second pass with {} pending files",
            pending_metadata.len()
        );

        // Second pass: fill media metadata for pending files
        for (relative_path, abs_path, mime_type) in pending_metadata {
            let is_image = mime_type
                .as_ref()
                .map(|m| m.starts_with("image/"))
                .unwrap_or(false);

            match MetadataService::extract(&abs_path).await {
                Ok(media_meta) => {
                    let width = media_meta.width.map(|w| w as i32);
                    let height = media_meta.height.map(|h| h as i32);
                    let duration = if is_image { None } else { media_meta.duration };

                    if let Err(e) = db::update_media_metadata(
                        &self.pool,
                        &relative_path,
                        width,
                        height,
                        duration,
                        STATUS_COMPLETE,
                    )
                    .await
                    {
                        debug!("DB update error for {:?}: {}", abs_path, e);
                        stats.errors += 1;
                    }
                }
                Err(crate::services::metadata::MetadataError::NotMediaFile) => {
                    // Mark as complete so we don't retry on non-media files
                    if let Err(e) = db::update_media_metadata(
                        &self.pool,
                        &relative_path,
                        None,
                        None,
                        None,
                        STATUS_COMPLETE,
                    )
                    .await
                    {
                        debug!("DB update error for {:?}: {}", abs_path, e);
                        stats.errors += 1;
                    }
                }
                Err(e) => {
                    debug!("Metadata extraction error for {:?}: {}", abs_path, e);
                    stats.errors += 1;
                    // Leave metadata_status as pending so future runs can retry
                }
            }
        }

        Ok(stats)
    }

    /// Check if indexer is currently running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }
}
