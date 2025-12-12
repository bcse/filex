use std::sync::Arc;
use axum::{
    extract::{Path, Query, State, Multipart},
    http::StatusCode,
    Json,
    body::Body,
    response::Response,
};
use serde::{Deserialize, Serialize};
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::api::{AppState, ErrorResponse};

#[derive(Debug, Deserialize)]
pub struct CreateDirRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub path: String,
    pub new_name: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Create a new directory
pub async fn create_directory(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDirRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.fs.create_directory(&req.path).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    Ok(Json(SuccessResponse {
        success: true,
        path: Some(req.path),
        message: Some("Directory created".to_string()),
    }))
}

/// Rename a file or directory
pub async fn rename(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let new_path = state.fs.rename(&req.path, &req.new_name).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    Ok(Json(SuccessResponse {
        success: true,
        path: Some(new_path),
        message: Some("Renamed successfully".to_string()),
    }))
}

/// Move a file or directory
pub async fn move_entry(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MoveRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let new_path = state.fs.move_entry(&req.from, &req.to).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    Ok(Json(SuccessResponse {
        success: true,
        path: Some(new_path),
        message: Some("Moved successfully".to_string()),
    }))
}

/// Delete a file or directory
pub async fn delete(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.fs.delete(&req.path).map_err(|e| {
        let status = match &e {
            crate::services::filesystem::FsError::NotFound(_) => StatusCode::NOT_FOUND,
            crate::services::filesystem::FsError::PermissionDenied(_) => StatusCode::FORBIDDEN,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    Ok(Json(SuccessResponse {
        success: true,
        path: Some(req.path),
        message: Some("Deleted successfully".to_string()),
    }))
}

/// Download a file
pub async fn download(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response<Body>, (StatusCode, Json<ErrorResponse>)> {
    let resolved = state.fs.resolve_path(&query.path).map_err(|e| {
        (StatusCode::NOT_FOUND, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    if resolved.is_dir() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "Cannot download a directory".to_string() })
        ));
    }
    
    let file = File::open(&resolved).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);
    
    let filename = resolved
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    
    let mime = mime_guess::from_path(&resolved)
        .first_or_octet_stream()
        .to_string();
    
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime)
        .header("Content-Disposition", format!("attachment; filename=\"{}\"", filename))
        .body(body)
        .unwrap())
}

/// Upload files
pub async fn upload(
    State(state): State<Arc<AppState>>,
    Path(target_path): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let target_dir = state.fs.resolve_path(&target_path).map_err(|e| {
        (StatusCode::NOT_FOUND, Json(ErrorResponse { error: e.to_string() }))
    })?;
    
    if !target_dir.is_dir() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "Target must be a directory".to_string() })
        ));
    }
    
    let mut uploaded = Vec::new();
    
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: e.to_string() }))
    })? {
        let file_name = field
            .file_name()
            .map(|s| s.to_string())
            .ok_or_else(|| {
                (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "Missing filename".to_string() }))
            })?;
        
        let dest_path = target_dir.join(&file_name);
        
        // Security: ensure we're still under root
        if !dest_path.starts_with(&target_dir) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse { error: "Invalid filename".to_string() })
            ));
        }
        
        let data = field.bytes().await.map_err(|e| {
            (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: e.to_string() }))
        })?;
        
        tokio::fs::write(&dest_path, &data).await.map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string() }))
        })?;
        
        uploaded.push(file_name);
    }
    
    Ok(Json(SuccessResponse {
        success: true,
        path: Some(target_path),
        message: Some(format!("Uploaded {} file(s)", uploaded.len())),
    }))
}
