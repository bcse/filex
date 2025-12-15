use crate::models::IndexedFileRow;
use sqlx::sqlite::SqlitePool;

/// Delete a path and any of its descendants from the index, returning the
/// number of rows removed.
pub async fn delete_by_path(pool: &SqlitePool, path: &str) -> Result<u64, sqlx::Error> {
    let pattern = format!("{}/%", path.trim_end_matches('/'));

    let result = sqlx::query("DELETE FROM indexed_files WHERE path = ? OR path LIKE ?")
        .bind(path)
        .bind(pattern)
        .execute(pool)
        .await?;

    Ok(result.rows_affected())
}

/// Rename a path in the index and cascade the update to children if the target
/// represents a directory. Returns the total number of affected rows.
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

/// Search indexed files using an order-agnostic full-text query built from the
/// supplied path fragment.
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

/// Retrieve media metadata rows for a set of paths; returns an empty list if
/// the input slice is empty.
pub async fn get_metadata_for_paths(
    pool: &SqlitePool,
    paths: &[String],
) -> Result<Vec<IndexedFileRow>, sqlx::Error> {
    if paths.is_empty() {
        return Ok(vec![]);
    }

    // SQLite defaults to 999 bound parameters. Chunk large IN clauses to stay
    // under that limit and avoid runtime errors when browsing directories with
    // many entries.
    const SQLITE_MAX_VARIABLES: usize = 999;
    const IN_CLAUSE_HEADROOM: usize = 50;
    let chunk_size = (SQLITE_MAX_VARIABLES - IN_CLAUSE_HEADROOM).max(1);

    let mut rows = Vec::new();

    for chunk in paths.chunks(chunk_size) {
        let placeholders = vec!["?"; chunk.len()].join(", ");
        let query = format!(
            "SELECT * FROM indexed_files WHERE path IN ({})",
            placeholders
        );

        let mut query_builder = sqlx::query_as::<_, IndexedFileRow>(&query);
        for path in chunk {
            query_builder = query_builder.bind(path);
        }

        rows.extend(query_builder.fetch_all(pool).await?);
    }

    Ok(rows)
}

/// Get size, last-modified value, and metadata status for a path, returning
/// `None` when the path is not indexed.
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

/// Insert or update an indexed file row keyed by path, refreshing the
/// `indexed_at` timestamp.
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

/// Update the media metadata fields for an existing path and bump its
/// `indexed_at` timestamp.
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

/// Remove rows for files that are no longer present on disk, returning the
/// number of deleted records.
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use sqlx::sqlite::SqlitePoolOptions;

    fn now_sqlite_timestamp() -> String {
        Utc::now()
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string()
    }

    #[tokio::test]
    async fn get_metadata_for_paths_batches_under_sqlite_variable_limit() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::init_db(&pool).await.unwrap();

        let total = 1_100; // > SQLite's 999 variable limit
        for i in 0..total {
            let path = format!("/file{i}.txt");
            let row = IndexedFileRow {
                id: 0,
                path: path.clone(),
                name: format!("file{i}.txt"),
                is_dir: false,
                size: Some(0),
                created_at: None,
                modified_at: None,
                mime_type: None,
                width: Some(100 + i as i32),
                height: None,
                duration: None,
                metadata_status: "complete".to_string(),
                indexed_at: now_sqlite_timestamp(),
            };
            upsert_file(&pool, &row).await.unwrap();
        }

        let paths: Vec<String> = (0..total).map(|i| format!("/file{i}.txt")).collect();
        let rows = get_metadata_for_paths(&pool, &paths).await.unwrap();
        assert_eq!(rows.len(), total);
    }
}
