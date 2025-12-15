use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;

use crate::db;
use crate::models::{FileEntry, TreeNode};
use crate::services::FilesystemService;

pub struct AppState {
    pub fs: FilesystemService,
    pub pool: SqlitePool,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListResponse {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// List directory contents
pub async fn list_directory(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<ListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let path = query.path.unwrap_or_else(|| "/".to_string());

    // Get file list from filesystem
    let mut entries = state.fs.list_directory(&path).map_err(|e| {
        let (status, msg) = match &e {
            crate::services::filesystem::FsError::NotFound(_) => {
                (StatusCode::NOT_FOUND, e.to_string())
            }
            crate::services::filesystem::FsError::PermissionDenied(_) => {
                (StatusCode::FORBIDDEN, e.to_string())
            }
            crate::services::filesystem::FsError::PathEscape => {
                (StatusCode::FORBIDDEN, "Access denied".to_string())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };
        (status, Json(ErrorResponse { error: msg }))
    })?;

    // Enrich with indexed media metadata
    let paths: Vec<String> = entries.iter().map(|e| e.path.clone()).collect();

    if let Ok(indexed) = db::get_metadata_for_paths(&state.pool, &paths).await {
        let indexed_map: HashMap<_, _> = indexed.into_iter().map(|f| (f.path.clone(), f)).collect();

        for entry in &mut entries {
            if let Some(indexed) = indexed_map.get(&entry.path) {
                entry.width = indexed.width.map(|w| w as u32);
                entry.height = indexed.height.map(|h| h as u32);
                entry.duration = indexed.duration;
            }
        }
    }

    Ok(Json(ListResponse { path, entries }))
}

/// Get directory tree for sidebar
pub async fn get_tree(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<TreeNode>>, (StatusCode, Json<ErrorResponse>)> {
    let path = query.path.unwrap_or_else(|| "/".to_string());

    let nodes = state.fs.get_tree_node(&path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(nodes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::FilesystemService;
    use chrono::Utc;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::fs;
    use tempfile::tempdir;

    fn now_sqlite_timestamp() -> String {
        Utc::now()
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string()
    }

    async fn test_state() -> (Arc<AppState>, tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempdir().expect("tempdir created");
        let root = tmp.path().join("root");
        fs::create_dir(&root).unwrap();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::init_db(&pool).await.unwrap();

        let state = Arc::new(AppState {
            fs: FilesystemService::new(root.clone()),
            pool,
        });

        (state, tmp, root)
    }

    #[tokio::test]
    async fn list_directory_enriches_with_indexed_metadata() {
        let (state, _tmp, root) = test_state().await;
        let file_path = root.join("video.mp4");
        fs::write(&file_path, b"data").unwrap();

        // Seed index row
        let indexed = crate::models::IndexedFileRow {
            id: 0,
            path: "/video.mp4".to_string(),
            name: "video.mp4".to_string(),
            is_dir: false,
            size: Some(4),
            created_at: None,
            modified_at: None,
            mime_type: Some("video/mp4".to_string()),
            width: Some(1920),
            height: Some(1080),
            duration: Some(12.5),
            metadata_status: "complete".to_string(),
            indexed_at: now_sqlite_timestamp(),
        };
        crate::db::upsert_file(&state.pool, &indexed).await.unwrap();

        let resp = list_directory(
            State(state.clone()),
            Query(ListQuery {
                path: Some("/".to_string()),
            }),
        )
        .await
        .unwrap();

        let entries = resp.0.entries;
        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry.path, "/video.mp4");
        assert_eq!(entry.width, Some(1920));
        assert_eq!(entry.height, Some(1080));
        assert_eq!(entry.duration, Some(12.5));
    }

    #[tokio::test]
    async fn list_directory_maps_not_found_to_404() {
        let (state, _tmp, _) = test_state().await;

        let err = list_directory(
            State(state),
            Query(ListQuery {
                path: Some("/missing".to_string()),
            }),
        )
        .await
        .unwrap_err();

        assert_eq!(err.0, StatusCode::NOT_FOUND);
    }
}
