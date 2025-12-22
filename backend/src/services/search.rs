//! Search service providing thread-safe access to the in-memory search index.

use sqlx::sqlite::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use super::search_index::SearchIndex;

/// Thread-safe search service wrapping the in-memory search index.
pub struct SearchService {
    index: Arc<RwLock<SearchIndex>>,
}

impl SearchService {
    /// Create a new search service with an empty index.
    pub fn new() -> Self {
        Self {
            index: Arc::new(RwLock::new(SearchIndex::new())),
        }
    }

    /// Rebuild the search index from the database.
    ///
    /// This fetches all indexed paths and rebuilds the index atomically.
    pub async fn rebuild_from_db(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        info!("Rebuilding search index from database");

        // Fetch all indexed paths with IDs
        let rows: Vec<(i64, String)> = sqlx::query_as("SELECT id, path FROM indexed_files")
            .fetch_all(pool)
            .await?;

        let count = rows.len();

        // Build new index (this is CPU-intensive but doesn't hold the lock)
        let new_index = SearchIndex::build_from_entries(rows);

        // Swap in the new index atomically
        let mut index = self.index.write().await;
        *index = new_index;

        info!("Search index rebuilt with {} entries", count);
        Ok(())
    }

    /// Search for matching file IDs.
    pub async fn search(&self, query: &str) -> Vec<i64> {
        let index = self.index.read().await;
        index.search(query)
    }

    /// Get the current index size.
    pub async fn index_size(&self) -> usize {
        let index = self.index.read().await;
        index.len()
    }

    /// Add a new entry to the index.
    pub async fn add_entry(&self, id: i64, path: &str) {
        let mut index = self.index.write().await;
        index.add_entry(id, path);
    }

    /// Remove an entry from the index by path.
    pub async fn remove_entry(&self, path: &str) {
        let mut index = self.index.write().await;
        if !index.remove_entry(path) {
            warn!("Search index: tried to remove non-existent path: {}", path);
        }
    }

    /// Remove entries by path prefix (for directory deletion).
    /// Note: This is a stub that defers to the next full index rebuild.
    #[allow(dead_code)]
    pub async fn remove_entries_by_prefix(&self, prefix: &str) {
        // For now, just log - directory deletions will be caught by next full rebuild
        // A full implementation would iterate and remove all paths starting with prefix
        warn!(
            "Search index: prefix removal for '{}' deferred to next rebuild",
            prefix
        );
    }

    /// Rename an entry in the index.
    pub async fn rename_entry(&self, old_path: &str, new_path: &str) {
        let mut index = self.index.write().await;
        if !index.rename_entry(old_path, new_path) {
            warn!(
                "Search index: tried to rename non-existent path: {}",
                old_path
            );
        }
    }

    /// Find the ID for a path in the index.
    pub async fn find_id_by_path(&self, path: &str) -> Option<i64> {
        let index = self.index.read().await;
        index.find_id_by_path(path)
    }
}

impl Default for SearchService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_service_basic() {
        let service = SearchService::new();

        service.add_entry(1, "/docs/file1.txt").await;
        service.add_entry(2, "/docs/file2.txt").await;
        service.add_entry(3, "/images/photo.jpg").await;

        assert_eq!(service.index_size().await, 3);

        let results = service.search("docs").await;
        assert!(results.contains(&1));
        assert!(results.contains(&2));
        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn test_search_service_remove() {
        let service = SearchService::new();

        service.add_entry(1, "/docs/file1.txt").await;
        service.add_entry(2, "/docs/file2.txt").await;

        service.remove_entry("/docs/file1.txt").await;

        assert_eq!(service.index_size().await, 1);

        let results = service.search("file1").await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_search_service_rename() {
        let service = SearchService::new();

        service.add_entry(1, "/docs/old.txt").await;

        service.rename_entry("/docs/old.txt", "/docs/new.txt").await;

        let results = service.search("old").await;
        assert!(results.is_empty());

        let results = service.search("new").await;
        assert_eq!(results, vec![1]);
    }
}
