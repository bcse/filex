use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use std::sync::Arc;
use tracing::{error, info};

use crate::api::AppState;
use crate::db;
use crate::services::{IndexerService, MetadataService};
use crate::version;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub git_commit: &'static str,
    pub built_at: &'static str,
    pub ffprobe_available: bool,
    pub database_status: DatabaseStatus,
}

#[derive(Debug, Serialize)]
pub struct StatisticsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_indexed_at: Option<String>,
    pub total_files_count: i64,
    pub total_size: String,
}

#[derive(Debug, Serialize)]
pub struct DatabaseStatus {
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct IndexStatusResponse {
    pub is_running: bool,
}

/// Health check endpoint with database status
pub async fn health(State(state): State<Arc<AppState>>) -> (StatusCode, Json<HealthResponse>) {
    let version_info = version::current();

    // Check database connectivity
    let db_status = match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => DatabaseStatus {
            connected: true,
            error: None,
        },
        Err(e) => DatabaseStatus {
            connected: false,
            error: Some(e.to_string()),
        },
    };

    let overall_status = if db_status.connected {
        "ok"
    } else {
        "degraded"
    };
    let status_code = if db_status.connected {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(HealthResponse {
            status: overall_status,
            version: version_info.version,
            git_commit: version_info.git_commit,
            built_at: version_info.built_at,
            ffprobe_available: MetadataService::is_available(),
            database_status: db_status,
        }),
    )
}

/// Statistics endpoint
pub async fn statistics(
    State(state): State<Arc<AppState>>,
) -> (StatusCode, Json<StatisticsResponse>) {
    match (
        db::get_last_indexed_at(&state.pool).await,
        db::get_indexed_totals(&state.pool).await,
    ) {
        (Ok(last_indexed_at), Ok((total_files_count, total_size_bytes))) => (
            StatusCode::OK,
            Json(StatisticsResponse {
                last_indexed_at,
                total_files_count,
                total_size: format_bytes(total_size_bytes),
            }),
        ),
        (Err(e), _) | (_, Err(e)) => {
            error!("Failed to fetch statistics: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(StatisticsResponse {
                    last_indexed_at: None,
                    total_files_count: 0,
                    total_size: "0 B".to_string(),
                }),
            )
        }
    }
}

fn format_bytes(bytes: i64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let mut value = (bytes.max(0)) as f64;
    let mut unit_index = 0;

    while value >= 1000.0 && unit_index < units.len() - 1 {
        value /= 1000.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", value as i64, units[unit_index])
    } else {
        format!("{:.1} {}", value, units[unit_index])
    }
}

/// Get indexer status
pub async fn index_status(State(indexer): State<Arc<IndexerService>>) -> Json<IndexStatusResponse> {
    Json(IndexStatusResponse {
        is_running: indexer.is_running().await,
    })
}

/// Trigger manual index
pub async fn trigger_index(
    State(indexer): State<Arc<IndexerService>>,
) -> Result<Json<IndexStatusResponse>, StatusCode> {
    // Spawn indexing in background
    let indexer_clone = indexer.clone();
    tokio::spawn(async move {
        match indexer_clone.run_full_index().await {
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
    });

    Ok(Json(IndexStatusResponse { is_running: true }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::AppState;
    use crate::config::{AuthConfig, Config};
    use crate::db;
    use crate::services::{FilesystemService, SearchService};
    use sqlx::sqlite::SqlitePoolOptions;
    use std::time::Duration;
    use tempfile::tempdir;
    use tokio::time::{sleep, timeout};

    fn test_config(root: &std::path::Path) -> Config {
        Config {
            root_path: root.to_path_buf(),
            host: "127.0.0.1".to_string(),
            port: 0,
            database_path: root.join("filex.db"),
            enable_indexer: false,
            index_interval_secs: 0,
            static_path: root.to_path_buf(),
            auth: AuthConfig {
                enabled: false,
                password: None,
                session_timeout_secs: 0,
                cookie_name: "test".to_string(),
            },
        }
    }

    #[tokio::test]
    async fn health_reports_database_connected() {
        let tmp = tempdir().unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        db::init_db(&pool).await.unwrap();

        let state = Arc::new(AppState {
            fs: FilesystemService::new(tmp.path().to_path_buf()),
            pool: pool.clone(),
            search: Arc::new(SearchService::new()),
        });

        let (status, Json(resp)) = health(State(state)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(resp.status, "ok");
        assert!(resp.database_status.connected);
    }

    #[tokio::test]
    async fn statistics_reports_last_indexed_at() {
        let tmp = tempdir().unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        db::init_db(&pool).await.unwrap();

        let state = Arc::new(AppState {
            fs: FilesystemService::new(tmp.path().to_path_buf()),
            pool: pool.clone(),
            search: Arc::new(SearchService::new()),
        });

        let (status, Json(resp)) = statistics(State(state)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(resp.last_indexed_at.is_none());
        assert_eq!(resp.total_files_count, 0);
        assert_eq!(resp.total_size, "0 B");
    }

    #[tokio::test]
    async fn index_status_reflects_running_flag() {
        let tmp = tempdir().unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        db::init_db(&pool).await.unwrap();

        let indexer = Arc::new(IndexerService::new(pool, &test_config(tmp.path()), None));

        indexer.set_running_for_test(true).await;

        let Json(resp) = index_status(State(indexer.clone())).await;
        assert!(resp.is_running);
    }

    #[tokio::test]
    async fn trigger_index_runs_in_background() {
        let tmp = tempdir().unwrap();
        let root = tmp.path().join("root");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("file.txt"), b"hello").unwrap();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        db::init_db(&pool).await.unwrap();

        let indexer = Arc::new(IndexerService::new(pool.clone(), &test_config(&root), None));

        let Json(resp) = trigger_index(State(indexer.clone())).await.unwrap();
        assert!(resp.is_running);

        // Wait until the indexed row appears.
        let count: i64 = timeout(Duration::from_secs(2), async {
            loop {
                let count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM indexed_files WHERE path = '/file.txt'",
                )
                .fetch_one(&pool)
                .await
                .unwrap();

                if count == 1 {
                    break count;
                }

                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("indexing finished");

        assert_eq!(count, 1);
    }

    #[test]
    fn format_bytes_renders_human_readable_sizes() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(999), "999 B");
        assert_eq!(format_bytes(1500), "1.5 KB");
        assert_eq!(format_bytes(1_500_000), "1.5 MB");
    }
}
