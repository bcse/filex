use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a file or directory entry for browsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub created: Option<DateTime<Utc>>,
    pub modified: Option<DateTime<Utc>>,
    pub mime_type: Option<String>,

    // Media metadata (from index, if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>, // seconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indexed_at: Option<DateTime<Utc>>,
}

/// Directory tree node for sidebar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub has_children: bool,
}

/// Raw indexed file row from the database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct IndexedFileRow {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<i64>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub mime_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration: Option<f64>,
    #[serde(skip_serializing)]
    pub metadata_status: String,
    pub indexed_at: String,
}

impl From<IndexedFileRow> for FileEntry {
    fn from(row: IndexedFileRow) -> Self {
        Self {
            id: Some(row.id),
            name: row.name,
            path: row.path,
            is_dir: row.is_dir,
            size: row.size.map(|s| s as u64),
            created: row
                .created_at
                .as_deref()
                .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            modified: row
                .modified_at
                .as_deref()
                .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            mime_type: row.mime_type,
            width: row.width.map(|w| w as u32),
            height: row.height.map(|h| h as u32),
            duration: row.duration,
            indexed_at: DateTime::parse_from_rfc3339(&row.indexed_at)
                .ok()
                .map(|dt| dt.with_timezone(&Utc)),
        }
    }
}

/// Media metadata extracted from ffprobe
#[derive(Debug, Clone, Default)]
pub struct MediaMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub format: Option<String>,
}
