use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::{AppState, ErrorResponse};
use crate::db;
use crate::models::FileEntry;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, serde::Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub entries: Vec<FileEntry>,
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

    let results = db::search_files(&state.pool, &query.q).await.map_err(|e| {
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
            }),
        )
        .await
        .unwrap();

        // Should include all three seeded rows
        let paths: Vec<_> = resp.0.entries.iter().map(|e| e.path.clone()).collect();
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
}
