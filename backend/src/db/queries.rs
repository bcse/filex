use crate::models::IndexedFileRow;
use sqlx::sqlite::SqlitePool;

#[derive(Clone, Copy)]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Clone, Copy)]
pub enum SearchSortField {
    Name,
    Path,
    Size,
    Modified,
    Created,
    Type,
    Dimensions,
    Duration,
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

/// Fetch indexed files by their IDs with sorting and pagination.
///
/// This is used by the in-memory search to fetch full records after ID matching.
/// The total count is the length of the input IDs slice.
pub async fn get_files_by_ids(
    pool: &SqlitePool,
    ids: &[i64],
    limit: i64,
    offset: i64,
    sort_field: SearchSortField,
    sort_order: SortOrder,
) -> Result<(Vec<IndexedFileRow>, i64), sqlx::Error> {
    if ids.is_empty() {
        return Ok((vec![], 0));
    }

    let total = ids.len() as i64;

    let order_expr = match sort_field {
        SearchSortField::Name => "LOWER(name)",
        SearchSortField::Path => "LOWER(path)",
        SearchSortField::Size => "COALESCE(size, 0)",
        SearchSortField::Modified => "COALESCE(modified_at, '')",
        SearchSortField::Created => "COALESCE(created_at, '')",
        SearchSortField::Type => "COALESCE(mime_type, '')",
        SearchSortField::Dimensions => "COALESCE(width, 0) * COALESCE(height, 0)",
        SearchSortField::Duration => "COALESCE(duration, 0)",
    };

    let order_dir = match sort_order {
        SortOrder::Asc => "ASC",
        SortOrder::Desc => "DESC",
    };

    // SQLite defaults to 999 bound parameters. We need to handle the case where
    // we have more IDs than the limit. We'll chunk the IDs and sort in memory
    // for large result sets.
    const SQLITE_MAX_VARIABLES: usize = 999;
    const IN_CLAUSE_HEADROOM: usize = 50; // Reserve some for LIMIT/OFFSET
    let chunk_size = (SQLITE_MAX_VARIABLES - IN_CLAUSE_HEADROOM).max(1);

    if ids.len() <= chunk_size {
        // Simple case: can fit all IDs in one query
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql = format!(
            r#"
            SELECT id, path, name, is_dir, size, created_at, modified_at, mime_type, width, height, duration, metadata_status, indexed_at
            FROM indexed_files
            WHERE id IN ({placeholders})
            ORDER BY is_dir DESC, {order_expr} {order_dir}, name ASC
            LIMIT ? OFFSET ?
            "#
        );

        let mut query_builder = sqlx::query_as::<_, IndexedFileRow>(&sql);
        for id in ids {
            query_builder = query_builder.bind(id);
        }
        query_builder = query_builder.bind(limit).bind(offset);

        let results = query_builder.fetch_all(pool).await?;
        Ok((results, total))
    } else {
        // Large result set: fetch all matching rows in chunks, then sort and paginate in memory
        let mut all_rows = Vec::with_capacity(ids.len());

        for chunk in ids.chunks(chunk_size) {
            let placeholders = vec!["?"; chunk.len()].join(", ");
            let sql = format!(
                r#"
                SELECT id, path, name, is_dir, size, created_at, modified_at, mime_type, width, height, duration, metadata_status, indexed_at
                FROM indexed_files
                WHERE id IN ({placeholders})
                "#
            );

            let mut query_builder = sqlx::query_as::<_, IndexedFileRow>(&sql);
            for id in chunk {
                query_builder = query_builder.bind(id);
            }

            all_rows.extend(query_builder.fetch_all(pool).await?);
        }

        // Sort in memory
        all_rows.sort_by(|a, b| {
            // Directories first
            match (a.is_dir, b.is_dir) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }

            // Then by sort field
            let cmp = match sort_field {
                SearchSortField::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                SearchSortField::Path => a.path.to_lowercase().cmp(&b.path.to_lowercase()),
                SearchSortField::Size => a.size.unwrap_or(0).cmp(&b.size.unwrap_or(0)),
                SearchSortField::Modified => a.modified_at.cmp(&b.modified_at),
                SearchSortField::Created => a.created_at.cmp(&b.created_at),
                SearchSortField::Type => a.mime_type.cmp(&b.mime_type),
                SearchSortField::Dimensions => {
                    let a_dim = a.width.unwrap_or(0) as i64 * a.height.unwrap_or(0) as i64;
                    let b_dim = b.width.unwrap_or(0) as i64 * b.height.unwrap_or(0) as i64;
                    a_dim.cmp(&b_dim)
                }
                SearchSortField::Duration => a
                    .duration
                    .unwrap_or(0.0)
                    .partial_cmp(&b.duration.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal),
            };

            match sort_order {
                SortOrder::Asc => cmp,
                SortOrder::Desc => cmp.reverse(),
            }
        });

        // Apply pagination
        let offset_usize = offset as usize;
        let limit_usize = limit as usize;
        let results: Vec<IndexedFileRow> = all_rows
            .into_iter()
            .skip(offset_usize)
            .take(limit_usize)
            .collect();

        Ok((results, total))
    }
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

/// Return all indexed paths from the database.
pub async fn list_indexed_paths(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT path FROM indexed_files")
        .fetch_all(pool)
        .await
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

/// Delete rows for the supplied paths (and their descendants), returning the number of deleted records.
pub async fn delete_by_paths<T: AsRef<str>>(
    pool: &SqlitePool,
    paths: &[T],
) -> Result<u64, sqlx::Error> {
    if paths.is_empty() {
        return Ok(0);
    }

    let mut tx = pool.begin().await?;
    let mut removed = 0;

    for path in paths {
        let path = path.as_ref();
        let pattern = format!("{}/%", path.trim_end_matches('/'));
        let result = sqlx::query("DELETE FROM indexed_files WHERE path = ? OR path LIKE ?")
            .bind(path)
            .bind(pattern)
            .execute(&mut *tx)
            .await?;
        removed += result.rows_affected();
    }

    tx.commit().await?;

    Ok(removed)
}

/// Rebuild the SQLite database to reclaim free space and defragment pages.
pub async fn vacuum(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("VACUUM").execute(pool).await?;
    Ok(())
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

    #[tokio::test]
    async fn rename_path_cascades_to_descendants() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::init_db(&pool).await.unwrap();

        sqlx::query("INSERT INTO indexed_files (path, name, is_dir) VALUES (?, ?, 1)")
            .bind("/docs")
            .bind("docs")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO indexed_files (path, name, is_dir) VALUES (?, ?, 0)")
            .bind("/docs/report.txt")
            .bind("report.txt")
            .execute(&pool)
            .await
            .unwrap();

        let updated = rename_path(&pool, "/docs", "/archive/docs", "docs-renamed")
            .await
            .unwrap();
        assert_eq!(updated, 2);

        let rows: Vec<(String, String, bool)> =
            sqlx::query_as("SELECT path, name, is_dir FROM indexed_files ORDER BY path ASC")
                .fetch_all(&pool)
                .await
                .unwrap();

        assert_eq!(
            rows,
            vec![
                (
                    "/archive/docs".to_string(),
                    "docs-renamed".to_string(),
                    true
                ),
                (
                    "/archive/docs/report.txt".to_string(),
                    "report.txt".to_string(),
                    false
                )
            ]
        );
    }

    #[tokio::test]
    async fn get_files_by_ids_chunks_and_sorts() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::init_db(&pool).await.unwrap();

        let dir_id: i64 = sqlx::query_scalar(
            "INSERT INTO indexed_files (path, name, is_dir) VALUES (?, ?, 1) RETURNING id",
        )
        .bind("/root")
        .bind("root")
        .fetch_one(&pool)
        .await
        .unwrap();

        // Use more than SQLITE_MAX_VARIABLES - IN_CLAUSE_HEADROOM to hit the chunked path.
        let total_files = 960;
        let mut ids = Vec::with_capacity(total_files + 1);
        ids.push(dir_id);

        for i in 0..total_files {
            let name = format!("file{i:04}.txt");
            let path = format!("/files/{name}");
            let id: i64 = sqlx::query_scalar(
                "INSERT INTO indexed_files (path, name, is_dir, size) VALUES (?, ?, 0, ?) RETURNING id",
            )
            .bind(&path)
            .bind(&name)
            .bind(i as i64)
            .fetch_one(&pool)
            .await
            .unwrap();
            ids.push(id);
        }

        // Page 1 should include the directory first, then the earliest file names.
        let (page, total) =
            get_files_by_ids(&pool, &ids, 5, 0, SearchSortField::Name, SortOrder::Asc)
                .await
                .unwrap();

        assert_eq!(total, ids.len() as i64);
        assert_eq!(page.len(), 5);
        assert!(page[0].is_dir);
        assert_eq!(page[0].name, "root");
        assert_eq!(page[1].name, "file0000.txt");
        assert_eq!(page[4].name, "file0003.txt");

        // Offsetting past the directory should return only files, still sorted.
        let (page_with_offset, _) =
            get_files_by_ids(&pool, &ids, 3, 1, SearchSortField::Name, SortOrder::Asc)
                .await
                .unwrap();

        let names: Vec<String> = page_with_offset.into_iter().map(|r| r.name).collect();
        assert_eq!(
            names,
            vec![
                "file0000.txt".to_string(),
                "file0001.txt".to_string(),
                "file0002.txt".to_string()
            ]
        );
    }
}
