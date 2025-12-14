use sqlx::{Error, sqlite::SqlitePool};

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
            indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path);
        CREATE INDEX IF NOT EXISTS idx_files_name ON indexed_files(name);
        CREATE INDEX IF NOT EXISTS idx_files_is_dir ON indexed_files(is_dir);
        
        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            path,
            name,
            content='indexed_files',
            content_rowid='id'
        );
        
        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON indexed_files BEGIN
            INSERT INTO files_fts(rowid, path, name) VALUES (new.id, new.path, new.name);
        END;
        
        CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON indexed_files BEGIN
            INSERT INTO files_fts(files_fts, rowid, path, name) VALUES('delete', old.id, old.path, old.name);
        END;
        
        CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON indexed_files BEGIN
            INSERT INTO files_fts(files_fts, rowid, path, name) VALUES('delete', old.id, old.path, old.name);
            INSERT INTO files_fts(rowid, path, name) VALUES (new.id, new.path, new.name);
        END;
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
