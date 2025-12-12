use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use std::sync::Arc;

use crate::services::{IndexerService, MetadataService};

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub ffprobe_available: bool,
}

#[derive(Debug, Serialize)]
pub struct IndexStatusResponse {
    pub is_running: bool,
}

/// Health check endpoint
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        ffprobe_available: MetadataService::is_available(),
    })
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
