use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::browse::ListResponse;
use crate::api::{AppState, ErrorResponse};
use crate::db;
use crate::models::FileEntry;

/// Default number of results returned when a search limit is not provided by the client.
const DEFAULT_LIMIT: i32 = 50;

/// Minimum allowed limit so every query returns at least one result when possible.
const MIN_LIMIT: i32 = 1;

/// Upper bound for a single search request to avoid expensive database queries.
const MAX_LIMIT: i32 = 500;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: i32,
}

fn default_limit() -> i32 {
    DEFAULT_LIMIT
}

/// Search files by path
pub async fn search_files(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ListResponse>, (StatusCode, Json<ErrorResponse>)> {
    if query.q.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Search query cannot be empty".to_string(),
            }),
        ));
    }

    let limit = query.limit.clamp(MIN_LIMIT, MAX_LIMIT);

    let results = db::search_files(&state.pool, &query.q, limit)
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

    Ok(Json(ListResponse {
        // Path field kept for response shape consistency with browse; search is not scoped to a single directory.
        path: "/search".to_string(),
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
                limit: 10,
            }),
        )
        .await
        .unwrap_err();

        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn search_returns_results_with_limit_clamped() {
        let (state, _tmp) = test_state().await;

        // Seed two rows that match "report"
        for path in ["/docs/report1.txt", "/docs/report2.txt"] {
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
                limit: 0,
            }),
        )
        .await
        .unwrap();

        // Should return at least one result, but capped by clamp(min=1)
        assert!(!resp.0.entries.is_empty());
        assert!(
            resp.0
                .entries
                .iter()
                .any(|r| r.path == "/docs/report1.txt" || r.path == "/docs/report2.txt")
        );
    }
}
