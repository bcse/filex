use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use std::sync::Arc;

use crate::api::AppState;
use crate::services::{IndexerService, MetadataService};
use crate::version;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub build_number: &'static str,
    pub git_commit: &'static str,
    pub built_at: &'static str,
    pub ffprobe_available: bool,
    pub database_status: DatabaseStatus,
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
            build_number: version_info.build_number,
            git_commit: version_info.git_commit,
            built_at: version_info.built_at,
            ffprobe_available: MetadataService::is_available(),
            database_status: db_status,
        }),
    )
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
        let _ = indexer_clone.run_full_index().await;
    });

    Ok(Json(IndexStatusResponse { is_running: true }))
}
