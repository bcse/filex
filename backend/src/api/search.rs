use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::{AppState, ErrorResponse, SortField, SortOrder};
use crate::db::{self, SearchSortField, SortOrder as DbSortOrder};
use crate::models::FileEntry;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub sort_by: Option<SortField>,
    pub sort_order: Option<SortOrder>,
}

#[derive(Debug, serde::Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub entries: Vec<FileEntry>,
    pub offset: usize,
    pub limit: usize,
    pub sort_by: SortField,
    pub sort_order: SortOrder,
    pub total: i64,
}

/// Search files by path
pub async fn search_files(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, (StatusCode, Json<ErrorResponse>)> {
    if query.q.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Search query cannot be empty".to_string(),
            }),
        ));
    }

    let limit = query.limit.unwrap_or(1000).max(1);
    let offset = query.offset.unwrap_or(0);
    let sort_by = query.sort_by.unwrap_or(SortField::Name);
    let sort_order = query.sort_order.unwrap_or(SortOrder::Asc);

    let db_sort_field = match sort_by {
        SortField::Name => SearchSortField::Name,
        SortField::Path => SearchSortField::Path,
        SortField::Size => SearchSortField::Size,
        SortField::Modified => SearchSortField::Modified,
        SortField::Created => SearchSortField::Created,
        SortField::Type => SearchSortField::Type,
        SortField::Dimensions => SearchSortField::Dimensions,
        SortField::Duration => SearchSortField::Duration,
    };

    let db_sort_order = match sort_order {
        SortOrder::Asc => DbSortOrder::Asc,
        SortOrder::Desc => DbSortOrder::Desc,
    };

    let (results, total) = db::search_files(
        &state.pool,
        &query.q,
        limit as i64,
        offset as i64,
        db_sort_field,
        db_sort_order,
    )
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    let entries: Vec<FileEntry> = results.into_iter().map(FileEntry::from).collect();

    Ok(Json(SearchResponse {
        query: query.q,
        entries,
        offset,
        limit,
        sort_by,
        sort_order,
        total,
    }))
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

    async fn test_state() -> (Arc<AppState>, tempfile::TempDir) {
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
            fs: FilesystemService::new(root),
            pool,
        });

        (state, tmp)
    }

    #[tokio::test]
    async fn search_rejects_empty_query() {
        let (state, _tmp) = test_state().await;

        let err = search_files(
            State(state),
            Query(SearchQuery {
                q: "   ".to_string(),
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap_err();

        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn search_returns_all_results() {
        let (state, _tmp) = test_state().await;

        // Seed rows that match "report"
        for path in [
            "/docs/report1.txt",
            "/docs/report2.txt",
            "/docs/reports/2024-summary.txt",
        ] {
            let indexed = crate::models::IndexedFileRow {
                id: 0,
                path: path.to_string(),
                name: path.split('/').last().unwrap().to_string(),
                is_dir: false,
                size: Some(5),
                created_at: None,
                modified_at: None,
                mime_type: Some("text/plain".to_string()),
                width: None,
                height: None,
                duration: None,
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            crate::db::upsert_file(&state.pool, &indexed)
                .await
                .expect("seed index");
        }

        // Request limit below MIN_LIMIT to ensure clamp kicks in
        let resp = search_files(
            State(state.clone()),
            Query(SearchQuery {
                q: "report".to_string(),
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap();

        // Should include all three seeded rows
        let paths: Vec<_> = resp.0.entries.iter().map(|e| e.path.clone()).collect();
        assert_eq!(resp.0.total, 3);
        assert_eq!(resp.0.limit, 1000);
        assert_eq!(resp.0.offset, 0);
        assert_eq!(resp.0.sort_by, SortField::Name);
        assert_eq!(resp.0.sort_order, SortOrder::Asc);
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"/docs/report1.txt".to_string()));
        assert!(paths.contains(&"/docs/report2.txt".to_string()));
        assert!(paths.contains(&"/docs/reports/2024-summary.txt".to_string()));
    }

    #[tokio::test]
    async fn search_matches_substrings() {
        let (state, _tmp) = test_state().await;

        for path in [
            "/people/john doe.txt",
            "/people/johndoe.txt",
            "/people/doe john.txt",
            "/people/doejohn.txt",
            "/people/123doejohn.txt",
            "/people/123johndoe.txt",
        ] {
            let indexed = crate::models::IndexedFileRow {
                id: 0,
                path: path.to_string(),
                name: path.split('/').last().unwrap().to_string(),
                is_dir: false,
                size: Some(1),
                created_at: None,
                modified_at: None,
                mime_type: Some("text/plain".to_string()),
                width: None,
                height: None,
                duration: None,
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            crate::db::upsert_file(&state.pool, &indexed)
                .await
                .expect("seed index");
        }

        let resp = search_files(
            State(state.clone()),
            Query(SearchQuery {
                q: "john".to_string(),
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap();

        let paths: Vec<_> = resp.0.entries.iter().map(|e| e.path.clone()).collect();
        assert_eq!(paths.len(), 6);
        assert!(paths.contains(&"/people/john doe.txt".to_string()));
        assert!(paths.contains(&"/people/johndoe.txt".to_string()));
        assert!(paths.contains(&"/people/doe john.txt".to_string()));
        assert!(paths.contains(&"/people/doejohn.txt".to_string()));
        assert!(paths.contains(&"/people/123doejohn.txt".to_string()));
        assert!(paths.contains(&"/people/123johndoe.txt".to_string()));
    }

    #[tokio::test]
    async fn search_treats_special_chars_literally() {
        let (state, _tmp) = test_state().await;

        for path in ["/docs/h&m.txt", "/docs/hm.txt", "/docs/h-m.txt"] {
            let indexed = crate::models::IndexedFileRow {
                id: 0,
                path: path.to_string(),
                name: path.split('/').last().unwrap().to_string(),
                is_dir: false,
                size: Some(1),
                created_at: None,
                modified_at: None,
                mime_type: Some("text/plain".to_string()),
                width: None,
                height: None,
                duration: None,
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            crate::db::upsert_file(&state.pool, &indexed)
                .await
                .expect("seed index");
        }

        let resp = search_files(
            State(state.clone()),
            Query(SearchQuery {
                q: "h&m".to_string(),
                offset: None,
                limit: None,
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap();

        let paths: Vec<_> = resp.0.entries.iter().map(|e| e.path.clone()).collect();
        assert_eq!(paths.len(), 1);
        assert!(paths.contains(&"/docs/h&m.txt".to_string()));
    }

    #[tokio::test]
    async fn search_respects_pagination() {
        let (state, _tmp) = test_state().await;

        for i in 0..35 {
            let path = format!("/notes/note-{i}.txt");
            let indexed = crate::models::IndexedFileRow {
                id: 0,
                path: path.clone(),
                name: path.split('/').last().unwrap().to_string(),
                is_dir: false,
                size: Some(1),
                created_at: None,
                modified_at: None,
                mime_type: Some("text/plain".to_string()),
                width: None,
                height: None,
                duration: None,
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            crate::db::upsert_file(&state.pool, &indexed)
                .await
                .expect("seed index");
        }

        let resp = search_files(
            State(state.clone()),
            Query(SearchQuery {
                q: "note".to_string(),
                offset: Some(10),
                limit: Some(10),
                sort_by: None,
                sort_order: None,
            }),
        )
        .await
        .unwrap();

        assert_eq!(resp.0.total, 35);
        assert_eq!(resp.0.entries.len(), 10);
        assert_eq!(resp.0.offset, 10);
        assert_eq!(resp.0.limit, 10);
    }

    #[tokio::test]
    async fn search_sorts_by_duration_desc() {
        let (state, _tmp) = test_state().await;

        let files = [
            ("/clips/short.mp4", 1.0),
            ("/clips/medium.mp4", 5.0),
            ("/clips/long.mp4", 10.0),
        ];

        for (path, duration) in files {
            let indexed = crate::models::IndexedFileRow {
                id: 0,
                path: path.to_string(),
                name: path.split('/').last().unwrap().to_string(),
                is_dir: false,
                size: Some(1),
                created_at: None,
                modified_at: None,
                mime_type: Some("video/mp4".to_string()),
                width: Some(1920),
                height: Some(1080),
                duration: Some(duration),
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            crate::db::upsert_file(&state.pool, &indexed)
                .await
                .expect("seed index");
        }

        let resp = search_files(
            State(state.clone()),
            Query(SearchQuery {
                q: "mp4".to_string(),
                offset: Some(0),
                limit: Some(10),
                sort_by: Some(SortField::Duration),
                sort_order: Some(SortOrder::Desc),
            }),
        )
        .await
        .unwrap();

        let names: Vec<_> = resp.0.entries.iter().map(|e| e.name.clone()).collect();
        assert_eq!(names, vec!["long.mp4", "medium.mp4", "short.mp4"]);
        assert_eq!(resp.0.sort_by, SortField::Duration);
        assert_eq!(resp.0.sort_order, SortOrder::Desc);
    }
}
