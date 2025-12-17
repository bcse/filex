use sqlx::{Error, sqlite::SqlitePool};

const DB_VERSION: i64 = 1;

pub async fn init_db(pool: &SqlitePool) -> Result<(), Error> {
    // Enable WAL mode for better concurrent read/write performance
    // This allows users to browse/search while the indexer writes
    sqlx::query("PRAGMA journal_mode=WAL").execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS indexed_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            is_dir BOOLEAN NOT NULL DEFAULT FALSE,
            size INTEGER,
            created_at TEXT,
            modified_at TEXT,
            mime_type TEXT,
            width INTEGER,
            height INTEGER,
            duration REAL,
            metadata_status TEXT NOT NULL DEFAULT 'complete',
            indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path);
        CREATE INDEX IF NOT EXISTS idx_files_name ON indexed_files(name);
        CREATE INDEX IF NOT EXISTS idx_files_is_dir ON indexed_files(is_dir);
        "#,
    )
    .execute(pool)
    .await?;

    // Cleanup legacy FTS artifacts if present
    sqlx::query(
        r#"
        DROP TRIGGER IF EXISTS files_ai;
        DROP TRIGGER IF EXISTS files_ad;
        DROP TRIGGER IF EXISTS files_au;
        DROP TABLE IF EXISTS files_fts;
        "#,
    )
    .execute(pool)
    .await?;

    migrate_db(pool).await?;

    Ok(())
}

async fn migrate_db(pool: &SqlitePool) -> Result<(), Error> {
    let version = get_user_version(pool).await?;

    if version < 1 {
        migrate_to_v1(pool).await?;
    }

    if version < DB_VERSION {
        set_user_version(pool, DB_VERSION).await?;
    }

    Ok(())
}

async fn migrate_to_v1(pool: &SqlitePool) -> Result<(), Error> {
    // Ensure metadata_status column exists for two-phase indexing.
    if !column_exists(pool, "indexed_files", "metadata_status").await? {
        sqlx::query(
            r#"
            ALTER TABLE indexed_files
            ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'complete'
            "#,
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Check if a column exists on a given table
async fn column_exists(pool: &SqlitePool, table: &str, column: &str) -> Result<bool, Error> {
    let exists: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1")
            .bind(table)
            .bind(column)
            .fetch_optional(pool)
            .await?;

    Ok(exists.is_some())
}

async fn get_user_version(pool: &SqlitePool) -> Result<i64, Error> {
    let version: (i64,) = sqlx::query_as("PRAGMA user_version")
        .fetch_one(pool)
        .await?;
    Ok(version.0)
}

async fn set_user_version(pool: &SqlitePool, version: i64) -> Result<(), Error> {
    let pragma = format!("PRAGMA user_version = {}", version);
    sqlx::query(&pragma).execute(pool).await?;
    Ok(())
}
