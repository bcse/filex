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
