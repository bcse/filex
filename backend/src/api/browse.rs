use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;

use crate::api::{SortField, SortOrder};
use crate::db;
use crate::models::{FileEntry, TreeNode};
use crate::services::{FilesystemService, SearchService};

pub struct AppState {
    pub fs: FilesystemService,
    pub pool: SqlitePool,
    pub search: Arc<SearchService>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub path: Option<String>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub sort_by: Option<SortField>,
    pub sort_order: Option<SortOrder>,
}

#[derive(Debug, Serialize)]
pub struct ListResponse {
    pub path: String,
    pub entries: Vec<FileEntry>,
    pub offset: usize,
    pub limit: usize,
    pub sort_by: SortField,
    pub sort_order: SortOrder,
    pub total: usize,
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
    let offset = query.offset.unwrap_or(0);
    let limit = query.limit.unwrap_or(1000).max(1);
    let sort_by = query.sort_by.unwrap_or(SortField::Name);
    let sort_order = query.sort_order.unwrap_or(SortOrder::Asc);

    // Get file list from filesystem
    let entries = state.fs.list_directory(&path).map_err(|e| {
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

    let total = entries.len();

    let mut entries = entries;

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

    sort_entries(&mut entries, sort_by, sort_order);

    // Apply pagination after sorting so slice boundaries are stable
    let paged_entries: Vec<_> = entries.into_iter().skip(offset).take(limit).collect();
    let entries = paged_entries;

    Ok(Json(ListResponse {
        path,
        entries,
        offset,
        limit,
        sort_by,
        sort_order,
        total,
    }))
}

fn sort_entries(entries: &mut [FileEntry], sort_by: SortField, sort_order: SortOrder) {
    use std::cmp::Ordering;

    entries.sort_by(|a, b| {
        let dir_order = match (a.is_dir, b.is_dir) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => Ordering::Equal,
        };

        if dir_order != Ordering::Equal {
            return dir_order;
        }

        let order = match sort_by {
            SortField::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            SortField::Path => a.path.to_lowercase().cmp(&b.path.to_lowercase()),
            SortField::Size => a.size.unwrap_or(0).cmp(&b.size.unwrap_or(0)),
            SortField::Modified => a
                .modified
                .map(|d| d.timestamp())
                .cmp(&b.modified.map(|d| d.timestamp())),
            SortField::Created => a
                .created
                .map(|d| d.timestamp())
                .cmp(&b.created.map(|d| d.timestamp())),
            SortField::Type => {
                let a_type = a
                    .mime_type
                    .as_deref()
                    .unwrap_or(if a.is_dir { "directory" } else { "" })
                    .to_lowercase();
                let b_type = b
                    .mime_type
                    .as_deref()
                    .unwrap_or(if b.is_dir { "directory" } else { "" })
                    .to_lowercase();
                a_type.cmp(&b_type)
            }
            SortField::Resolutions => {
                let a_pixels = a.width.unwrap_or(0) as u64 * a.height.unwrap_or(0) as u64;
                let b_pixels = b.width.unwrap_or(0) as u64 * b.height.unwrap_or(0) as u64;
                a_pixels.cmp(&b_pixels)
            }
            SortField::Duration => a
                .duration
                .unwrap_or(0.0)
                .partial_cmp(&b.duration.unwrap_or(0.0))
                .unwrap_or(Ordering::Equal),
        };

        let ordered = match sort_order {
            SortOrder::Asc => order,
            SortOrder::Desc => order.reverse(),
        };

        if ordered == Ordering::Equal {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else {
            ordered
        }
    });
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

        let search = Arc::new(crate::services::SearchService::new());

        let state = Arc::new(AppState {
            fs: FilesystemService::new(root.clone()),
            pool,
            search,
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
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap();

        let entries = resp.0.entries;
        assert_eq!(resp.0.offset, 0);
        assert_eq!(resp.0.limit, 1000);
        assert_eq!(resp.0.sort_by, SortField::Name);
        assert_eq!(resp.0.sort_order, SortOrder::Asc);
        assert_eq!(resp.0.total, 1);
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
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap_err();

        assert_eq!(err.0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn list_directory_paginates_entries() {
        let (state, _tmp, root) = test_state().await;

        for i in 0..45 {
            let file_path = root.join(format!("file{i}.txt"));
            fs::write(&file_path, b"data").unwrap();
        }

        let resp = list_directory(
            State(state),
            Query(ListQuery {
                path: Some("/".to_string()),
                offset: Some(10),
                limit: Some(10),
                sort_by: Some(SortField::Name),
                sort_order: Some(SortOrder::Asc),
            }),
        )
        .await
        .unwrap();

        assert_eq!(resp.0.total, 45);
        assert_eq!(resp.0.offset, 10);
        assert_eq!(resp.0.limit, 10);
        assert_eq!(resp.0.entries.len(), 10);
    }

    #[tokio::test]
    async fn list_directory_sorts_by_size_descending() {
        let (state, _tmp, root) = test_state().await;

        let files = [
            ("small.txt", 10u64),
            ("medium.txt", 50u64),
            ("large.txt", 100u64),
        ];

        for (name, size) in files {
            let path = root.join(name);
            fs::write(&path, vec![0u8; size as usize]).unwrap();
        }

        let resp = list_directory(
            State(state),
            Query(ListQuery {
                path: Some("/".to_string()),
                offset: Some(0),
                limit: Some(10),
                sort_by: Some(SortField::Size),
                sort_order: Some(SortOrder::Desc),
            }),
        )
        .await
        .unwrap();

        let names: Vec<_> = resp.0.entries.iter().map(|e| e.name.clone()).collect();
        assert_eq!(names, vec!["large.txt", "medium.txt", "small.txt"]);
    }
}
