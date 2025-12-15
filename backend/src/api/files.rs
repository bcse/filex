use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::Response,
};
use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

// Encode filenames for Content-Disposition to avoid header injection.
const FILENAME_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'\"')
    .add(b'\\')
    .add(b'\'')
    .add(b';')
    .add(b'%')
    .add(b'\n')
    .add(b'\r')
    .add(b'\t');

use crate::api::{AppState, ErrorResponse};
use crate::db;

fn status_for_fs_error(e: &crate::services::filesystem::FsError) -> StatusCode {
    match e {
        crate::services::filesystem::FsError::NotFound(_) => StatusCode::NOT_FOUND,
        crate::services::filesystem::FsError::PermissionDenied(_) => StatusCode::FORBIDDEN,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

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
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Deserialize)]
pub struct CopyRequest {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub overwrite: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub performed: Option<bool>,
}

/// Create a new directory
pub async fn create_directory(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDirRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.fs.create_directory(&req.path).map_err(|e| {
        (
            status_for_fs_error(&e),
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(req.path),
        message: Some("Directory created".to_string()),
        performed: None,
    }))
}

/// Rename a file or directory
pub async fn rename(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    if req.new_name == "."
        || req.new_name == ".."
        || req.new_name.contains('/')
        || req.new_name.contains('\\')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid new name".to_string(),
            }),
        ));
    }

    let new_path = state.fs.rename(&req.path, &req.new_name).map_err(|e| {
        (
            status_for_fs_error(&e),
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    db::rename_path(&state.pool, &req.path, &new_path, &req.new_name)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(new_path),
        message: Some("Renamed successfully".to_string()),
        performed: None,
    }))
}

/// Move a file or directory
pub async fn move_entry(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MoveRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let result = state
        .fs
        .move_entry(&req.from, &req.to, req.overwrite)
        .map_err(|e| {
            (
                status_for_fs_error(&e),
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    if result.performed {
        let new_name = std::path::Path::new(&result.path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| req.to.clone());

        db::rename_path(&state.pool, &req.from, &result.path, &new_name)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: e.to_string(),
                    }),
                )
            })?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(result.path),
        message: Some(
            if result.performed {
                "Moved successfully"
            } else {
                "Skipped (already exists)"
            }
            .to_string(),
        ),
        performed: Some(result.performed),
    }))
}

/// Copy a file or directory
pub async fn copy_entry(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CopyRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let result = state
        .fs
        .copy_entry(&req.from, &req.to, req.overwrite)
        .map_err(|e| {
            (
                status_for_fs_error(&e),
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(result.path),
        message: Some(
            if result.performed {
                "Copied successfully"
            } else {
                "Skipped (already exists)"
            }
            .to_string(),
        ),
        performed: Some(result.performed),
    }))
}

/// Delete a file or directory
pub async fn delete(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.fs.delete(&req.path).map_err(|e| {
        (
            status_for_fs_error(&e),
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    db::delete_by_path(&state.pool, &req.path)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(req.path),
        message: Some("Deleted successfully".to_string()),
        performed: None,
    }))
}

/// Download a file
pub async fn download(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response<Body>, (StatusCode, Json<ErrorResponse>)> {
    let resolved = state.fs.resolve_path(&query.path).map_err(|e| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    if resolved.is_dir() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Cannot download a directory".to_string(),
            }),
        ));
    }

    let file = File::open(&resolved).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let filename = resolved
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    let encoded_filename = utf8_percent_encode(filename, FILENAME_ENCODE_SET).to_string();

    let mime = mime_guess::from_path(&resolved)
        .first_or_octet_stream()
        .to_string();

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime)
        .header(
            "Content-Disposition",
            format!("attachment; filename*=UTF-8''{}", encoded_filename),
        )
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
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    if !target_dir.is_dir() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Target must be a directory".to_string(),
            }),
        ));
    }

    let mut uploaded = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })? {
        let file_name = field.file_name().map(|s| s.to_string()).ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Missing filename".to_string(),
                }),
            )
        })?;

        let dest_path = target_dir.join(&file_name);

        // Security: ensure we're still under root
        if !dest_path.starts_with(&target_dir) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "Invalid filename".to_string(),
                }),
            ));
        }

        let data = field.bytes().await.map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

        tokio::fs::write(&dest_path, &data).await.map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

        uploaded.push(file_name);
    }

    Ok(Json(SuccessResponse {
        success: true,
        path: Some(target_path),
        message: Some(format!("Uploaded {} file(s)", uploaded.len())),
        performed: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::FilesystemService;
    use axum::Router;
    use axum::body::Body;
    use axum::extract::State;
    use axum::http::{Request, StatusCode, header};
    use chrono::Utc;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::fs;
    use tempfile::tempdir;
    use tower::ServiceExt;

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
    async fn rename_updates_filesystem_and_index() {
        let (state, _tmp, root) = test_state().await;
        let original = root.join("old.txt");
        fs::write(&original, b"hello").unwrap();

        let indexed = crate::models::IndexedFileRow {
            id: 0,
            path: "/old.txt".to_string(),
            name: "old.txt".to_string(),
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

        let resp = rename(
            State(state.clone()),
            Json(RenameRequest {
                path: "/old.txt".to_string(),
                new_name: "new.txt".to_string(),
            }),
        )
        .await
        .expect("rename should succeed");

        assert_eq!(resp.0.path.as_deref(), Some("/new.txt"));
        assert!(!original.exists());
        assert!(root.join("new.txt").exists());

        let count_old: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/old.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let count_new: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/new.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();

        assert_eq!(count_old, 0);
        assert_eq!(count_new, 1);
    }

    #[tokio::test]
    async fn download_rejects_directories_and_sets_headers() {
        let (state, _tmp, root) = test_state().await;
        let file_path = root.join("file.txt");
        fs::write(&file_path, b"hello").unwrap();

        // Directory download should be rejected
        let err = download(
            State(state.clone()),
            Query(DownloadQuery {
                path: "/".to_string(),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);

        // Successful download returns headers
        let response = download(
            State(state.clone()),
            Query(DownloadQuery {
                path: "/file.txt".to_string(),
            }),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        assert_eq!(headers.get(header::CONTENT_TYPE).unwrap(), "text/plain");
        let disposition = headers.get(header::CONTENT_DISPOSITION).unwrap();
        assert!(
            disposition
                .to_str()
                .unwrap()
                .contains("filename*=UTF-8''file.txt")
        );
    }

    #[tokio::test]
    async fn upload_rejects_missing_directory_and_missing_filename() {
        let (state, _tmp, root) = test_state().await;
        // Build an app route for upload to drive the Multipart extractor
        let app = Router::new()
            .route("/upload/*path", axum::routing::post(upload))
            .with_state(state.clone());

        // Target that doesn't exist
        let boundary = "BOUNDARY123";
        let body_stream = Body::from(format!("--{boundary}--"));
        let request = Request::builder()
            .method("POST")
            .uri("/upload/missing")
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(body_stream)
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        // Existing target but missing filename in part
        fs::create_dir_all(root.join("dir")).unwrap();
        let boundary = "BOUNDARY456";
        let body_stream = Body::from(format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"field\"\r\n\r\ndata\r\n--{boundary}--"
        ));
        let request = Request::builder()
            .method("POST")
            .uri("/upload/dir")
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(body_stream)
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn upload_succeeds_and_writes_file() {
        let (state, _tmp, root) = test_state().await;
        fs::create_dir_all(root.join("dir")).unwrap();

        let app = Router::new()
            .route("/upload/*path", axum::routing::post(upload))
            .with_state(state.clone());

        let boundary = "BOUNDARY789";
        let body_stream = Body::from(format!(
            "--{boundary}\r\n\
             Content-Disposition: form-data; name=\"file\"; filename=\"hello.txt\"\r\n\
             Content-Type: text/plain\r\n\r\n\
             hello world\r\n\
             --{boundary}--"
        ));
        let request = Request::builder()
            .method("POST")
            .uri("/upload/dir")
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(body_stream)
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let uploaded = root.join("dir/hello.txt");
        assert!(uploaded.exists());
        assert_eq!(fs::read_to_string(uploaded).unwrap(), "hello world");
    }

    #[tokio::test]
    async fn delete_removes_file_and_index_row() {
        let (state, _tmp, root) = test_state().await;
        let file_path = root.join("remove.txt");
        fs::write(&file_path, b"bye").unwrap();

        let indexed = crate::models::IndexedFileRow {
            id: 0,
            path: "/remove.txt".to_string(),
            name: "remove.txt".to_string(),
            is_dir: false,
            size: Some(3),
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

        let _ = delete(
            State(state.clone()),
            Json(DeleteRequest {
                path: "/remove.txt".to_string(),
            }),
        )
        .await
        .expect("delete ok");

        assert!(!file_path.exists());
        let remaining: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/remove.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn move_endpoint_moves_and_updates_index() {
        let (state, _tmp, root) = test_state().await;
        fs::create_dir_all(root.join("from")).unwrap();
        fs::create_dir_all(root.join("to")).unwrap();

        let original = root.join("from/file.txt");
        fs::write(&original, b"move me").unwrap();

        let indexed = crate::models::IndexedFileRow {
            id: 0,
            path: "/from/file.txt".to_string(),
            name: "file.txt".to_string(),
            is_dir: false,
            size: Some(7),
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

        let resp = move_entry(
            State(state.clone()),
            Json(MoveRequest {
                from: "/from/file.txt".to_string(),
                to: "/to".to_string(),
                overwrite: false,
            }),
        )
        .await
        .expect("move should succeed");

        assert_eq!(resp.0.path.as_deref(), Some("/to/file.txt"));
        assert!(root.join("to/file.txt").exists());
        assert!(!original.exists());

        let count_old: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/from/file.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let count_new: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/to/file.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert_eq!(count_old, 0);
        assert_eq!(count_new, 1);
    }

    #[tokio::test]
    async fn copy_endpoint_copies_and_leaves_index_unchanged() {
        let (state, _tmp, root) = test_state().await;
        fs::create_dir_all(root.join("from")).unwrap();
        fs::create_dir_all(root.join("to")).unwrap();

        let original = root.join("from/file.txt");
        fs::write(&original, b"copy me").unwrap();

        let indexed = crate::models::IndexedFileRow {
            id: 0,
            path: "/from/file.txt".to_string(),
            name: "file.txt".to_string(),
            is_dir: false,
            size: Some(7),
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

        let resp = copy_entry(
            State(state.clone()),
            Json(CopyRequest {
                from: "/from/file.txt".to_string(),
                to: "/to".to_string(),
                overwrite: false,
            }),
        )
        .await
        .expect("copy should succeed");

        assert_eq!(resp.0.path.as_deref(), Some("/to/file.txt"));
        assert!(root.join("to/file.txt").exists());
        assert!(original.exists(), "source should remain");

        // Index should remain unchanged; copy job is left for the indexer.
        let count_original: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/from/file.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let count_copied: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM indexed_files WHERE path = ?")
                .bind("/to/file.txt")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert_eq!(count_original, 1);
        assert_eq!(count_copied, 0);
    }
}
