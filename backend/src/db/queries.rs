use crate::models::IndexedFileRow;
use sqlx::sqlite::SqlitePool;

/// Delete a file or directory (and its children) from the index
pub async fn delete_by_path(pool: &SqlitePool, path: &str) -> Result<u64, sqlx::Error> {
    let pattern = format!("{}/%", path.trim_end_matches('/'));

    let result = sqlx::query("DELETE FROM indexed_files WHERE path = ? OR path LIKE ?")
        .bind(path)
        .bind(pattern)
        .execute(pool)
        .await?;

    Ok(result.rows_affected())
}

/// Rename a file or directory in the index (cascades to children for directories)
pub async fn rename_path(
    pool: &SqlitePool,
    old_path: &str,
    new_path: &str,
    new_name: &str,
) -> Result<u64, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let mut affected = 0;

    // Update the entry itself
    let res = sqlx::query("UPDATE indexed_files SET path = ?, name = ? WHERE path = ?")
        .bind(new_path)
        .bind(new_name)
        .bind(old_path)
        .execute(&mut *tx)
        .await?;
    affected += res.rows_affected();

    // Update any children if this was a directory
    let child_pattern = format!("{}/%", old_path.trim_end_matches('/'));
    let res_children = sqlx::query(
        "UPDATE indexed_files SET path = ? || substr(path, length(?)+1) WHERE path LIKE ?",
    )
    .bind(new_path)
    .bind(old_path)
    .bind(child_pattern)
    .execute(&mut *tx)
    .await?;
    affected += res_children.rows_affected();

    tx.commit().await?;

    Ok(affected)
}

/// Search files by path pattern
pub async fn search_files(
    pool: &SqlitePool,
    query: &str,
    limit: i32,
) -> Result<Vec<IndexedFileRow>, sqlx::Error> {
    let fts_query = build_fts_query(query);

    if fts_query.is_empty() {
        return Ok(vec![]);
    }

    // Use FTS5 for fast full-text search
    let results = sqlx::query_as::<_, IndexedFileRow>(
        r#"
        SELECT f.* 
        FROM indexed_files f
        JOIN files_fts fts ON f.id = fts.rowid
        WHERE files_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        "#,
    )
    .bind(fts_query)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(results)
}

/// Build an FTS query that is order-agnostic and also matches concatenated tokens.
fn build_fts_query(raw: &str) -> String {
    let tokens: Vec<String> = raw
        .split(|c: char| c.is_whitespace() || !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
        .collect();

    if tokens.is_empty() {
        return String::new();
    }

    let order_agnostic = tokens
        .iter()
        .map(|t| format!("{}*", t))
        .collect::<Vec<_>>()
        .join(" AND ");

    let mut clauses = vec![order_agnostic];

    // Also match paths where the tokens are adjacent with no separators (e.g., "johndoe")
    if tokens.len() > 1 {
        clauses.push(format!("{}*", tokens.join("")));
    }

    clauses.join(" OR ")
}

/// Get media metadata for files in a directory (for enriching browse results)
pub async fn get_metadata_for_paths(
    pool: &SqlitePool,
    paths: &[String],
) -> Result<Vec<IndexedFileRow>, sqlx::Error> {
    if paths.is_empty() {
        return Ok(vec![]);
    }

    // Build placeholders for IN clause
    let placeholders: Vec<_> = (0..paths.len()).map(|i| format!("?{}", i + 1)).collect();
    let query = format!(
        "SELECT * FROM indexed_files WHERE path IN ({})",
        placeholders.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, IndexedFileRow>(&query);
    for path in paths {
        query_builder = query_builder.bind(path);
    }

    query_builder.fetch_all(pool).await
}

/// Get a file's size and modified_at for change detection
pub async fn get_file_by_path(
    pool: &SqlitePool,
    path: &str,
) -> Result<Option<(Option<i64>, Option<String>, String)>, sqlx::Error> {
    let row: Option<(Option<i64>, Option<String>, String)> = sqlx::query_as(
        "SELECT size, modified_at, metadata_status FROM indexed_files WHERE path = ?",
    )
    .bind(path)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Upsert a file record
pub async fn upsert_file(pool: &SqlitePool, file: &IndexedFileRow) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO indexed_files (path, name, is_dir, size, created_at, modified_at, mime_type, width, height, duration, metadata_status, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(path) DO UPDATE SET
            name = excluded.name,
            is_dir = excluded.is_dir,
            size = excluded.size,
            created_at = excluded.created_at,
            modified_at = excluded.modified_at,
            mime_type = excluded.mime_type,
            width = excluded.width,
            height = excluded.height,
            duration = excluded.duration,
            metadata_status = excluded.metadata_status,
            indexed_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&file.path)
    .bind(&file.name)
    .bind(file.is_dir)
    .bind(file.size)
    .bind(&file.created_at)
    .bind(&file.modified_at)
    .bind(&file.mime_type)
    .bind(file.width)
    .bind(file.height)
    .bind(file.duration)
    .bind(&file.metadata_status)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update only the media metadata fields for a path
pub async fn update_media_metadata(
    pool: &SqlitePool,
    path: &str,
    width: Option<i32>,
    height: Option<i32>,
    duration: Option<f64>,
    metadata_status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE indexed_files
        SET width = ?, height = ?, duration = ?, metadata_status = ?, indexed_at = CURRENT_TIMESTAMP
        WHERE path = ?
        "#,
    )
    .bind(width)
    .bind(height)
    .bind(duration)
    .bind(metadata_status)
    .bind(path)
    .execute(pool)
    .await?;

    Ok(())
}

/// Remove files that no longer exist (cleanup)
pub async fn remove_missing_files(
    pool: &SqlitePool,
    existing_paths: &[String],
) -> Result<u64, sqlx::Error> {
    // This is a simplified version - in production you might want batching
    let result =
        sqlx::query("DELETE FROM indexed_files WHERE path NOT IN (SELECT value FROM json_each(?))")
            .bind(serde_json::to_string(existing_paths).unwrap_or_default())
            .execute(pool)
            .await?;

    Ok(result.rows_affected())
}
