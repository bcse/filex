use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<FileEntry>,
    pub count: usize,
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

    let results: Vec<FileEntry> = results.into_iter().map(FileEntry::from).collect();
    let count = results.len();

    Ok(Json(SearchResponse {
        query: query.q,
        results,
        count,
    }))
}
