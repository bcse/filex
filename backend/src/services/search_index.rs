//! In-memory search index for fast substring matching on file paths.
//!
//! Stores normalized (casefolded + diacritic-stripped) paths in contiguous memory
//! for cache-efficient searching with memchr and Aho-Corasick.

use aho_corasick::AhoCorasick;
use memchr::memmem;
use rayon::prelude::*;
use std::time::Instant;
use tracing::info;
use unicode_normalization::UnicodeNormalization;

/// Normalize a path for search: NFD decomposition, strip combining marks, lowercase.
///
/// This enables matching "café" with "cafe", "naïve" with "naive", etc.
pub fn normalize_path(path: &str) -> String {
    path.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Check if a character is a combining mark (diacritic).
fn is_combining_mark(c: char) -> bool {
    // Unicode combining marks are in the range U+0300 to U+036F (Combining Diacritical Marks)
    // and other ranges. We use the general category check.
    matches!(c, '\u{0300}'..='\u{036F}' | '\u{1AB0}'..='\u{1AFF}' | '\u{1DC0}'..='\u{1DFF}' | '\u{20D0}'..='\u{20FF}' | '\u{FE20}'..='\u{FE2F}')
}

/// A compact in-memory index for fast substring search on file paths.
///
/// Paths are stored in a contiguous `Vec<u8>` with their normalized forms
/// (casefolded + diacritic-stripped). A parallel `Vec<u32>` tracks
/// the byte offsets where each path starts.
#[derive(Default)]
pub struct SearchIndex {
    /// Database row IDs corresponding to each indexed path
    ids: Vec<i64>,

    /// Byte offset into `normalized_paths` where each path starts
    offsets: Vec<u32>,

    /// Contiguous buffer of all normalized paths (UTF-8 bytes)
    normalized_paths: Vec<u8>,

    /// Original paths (not normalized) for lookup by index
    original_paths: Vec<String>,
}

impl SearchIndex {
    /// Create a new empty search index.
    pub fn new() -> Self {
        Self::default()
    }

    /// Build a search index from a list of (id, path) pairs.
    pub fn build_from_entries(entries: Vec<(i64, String)>) -> Self {
        let mut index = Self::new();

        // Pre-allocate with estimates
        let estimated_path_bytes: usize = entries.iter().map(|(_, p)| p.len()).sum();
        index.ids.reserve(entries.len());
        index.offsets.reserve(entries.len());
        index.original_paths.reserve(entries.len());
        index.normalized_paths.reserve(estimated_path_bytes);

        let mut offset: u32 = 0;

        for (id, path) in entries {
            let normalized = normalize_path(&path);
            let norm_bytes = normalized.as_bytes();

            index.ids.push(id);
            index.offsets.push(offset);
            index.original_paths.push(path);
            index.normalized_paths.extend_from_slice(norm_bytes);

            offset += norm_bytes.len() as u32;
        }

        index
    }

    /// Get the number of indexed entries.
    pub fn len(&self) -> usize {
        self.ids.len()
    }

    /// Check if the index is empty.
    pub fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    /// Get the byte slice for path at index `i`.
    fn get_path_bytes(&self, i: usize) -> &[u8] {
        let start = self.offsets[i] as usize;
        let end = if i + 1 < self.offsets.len() {
            self.offsets[i + 1] as usize
        } else {
            self.normalized_paths.len()
        };
        &self.normalized_paths[start..end]
    }

    /// Search for paths matching a single term using memchr.
    fn search_single_term(&self, term: &str) -> Vec<i64> {
        let normalized_term = normalize_path(term);
        let needle = normalized_term.as_bytes();

        if needle.is_empty() {
            return vec![];
        }

        let finder = memmem::Finder::new(needle);

        (0..self.len())
            .into_par_iter()
            .filter_map(|i| {
                let path_bytes = self.get_path_bytes(i);
                if finder.find(path_bytes).is_some() {
                    Some(self.ids[i])
                } else {
                    None
                }
            })
            .collect()
    }

    /// Search for paths matching multiple terms using Aho-Corasick.
    /// All terms must appear in the path for a match.
    fn search_multi_term(&self, terms: &[String]) -> Vec<i64> {
        let normalized_terms: Vec<String> = terms.iter().map(|t| normalize_path(t)).collect();

        // Filter out empty terms
        let non_empty_terms: Vec<&[u8]> = normalized_terms
            .iter()
            .filter(|t| !t.is_empty())
            .map(|t| t.as_bytes())
            .collect();

        if non_empty_terms.is_empty() {
            return vec![];
        }

        let term_count = non_empty_terms.len();

        // Build Aho-Corasick automaton
        let ac = match AhoCorasick::new(&non_empty_terms) {
            Ok(ac) => ac,
            Err(_) => return vec![],
        };

        (0..self.len())
            .into_par_iter()
            .filter_map(|i| {
                let path_bytes = self.get_path_bytes(i);

                // Track which patterns matched
                let mut matched = vec![false; term_count];
                for mat in ac.find_iter(path_bytes) {
                    matched[mat.pattern().as_usize()] = true;
                }

                // All terms must match
                if matched.iter().all(|&m| m) {
                    Some(self.ids[i])
                } else {
                    None
                }
            })
            .collect()
    }

    /// Main search entry point - delegates to single or multi-term search.
    pub fn search(&self, query: &str) -> Vec<i64> {
        let start = Instant::now();

        let terms: Vec<String> = query
            .split_whitespace()
            .filter(|t| !t.is_empty())
            .map(|t| t.to_string())
            .collect();

        let results = match terms.len() {
            0 => vec![],
            1 => self.search_single_term(&terms[0]),
            _ => self.search_multi_term(&terms),
        };

        let elapsed = start.elapsed();
        let elapsed_str = format!("{:.3}s", elapsed.as_secs_f64());
        info!(
            query = %query,
            terms = terms.len(),
            results = results.len(),
            index_size = self.len(),
            elapsed = %elapsed_str,
            "Search completed"
        );

        results
    }

    /// Add a new entry to the index.
    pub fn add_entry(&mut self, id: i64, path: &str) {
        let normalized = normalize_path(path);
        let norm_bytes = normalized.as_bytes();

        let offset = self.normalized_paths.len() as u32;

        self.ids.push(id);
        self.offsets.push(offset);
        self.original_paths.push(path.to_string());
        self.normalized_paths.extend_from_slice(norm_bytes);
    }

    /// Remove an entry from the index by path.
    /// Returns true if an entry was removed.
    pub fn remove_entry(&mut self, path: &str) -> bool {
        // Find the index of the entry with this path
        let idx = match self.original_paths.iter().position(|p| p == path) {
            Some(idx) => idx,
            None => return false,
        };

        // Get the byte range for this entry
        let start = self.offsets[idx] as usize;
        let end = if idx + 1 < self.offsets.len() {
            self.offsets[idx + 1] as usize
        } else {
            self.normalized_paths.len()
        };
        let removed_len = (end - start) as u32;

        // Remove from all vectors
        self.ids.remove(idx);
        self.original_paths.remove(idx);
        self.offsets.remove(idx);

        // Remove bytes from normalized_paths
        self.normalized_paths.drain(start..end);

        // Update offsets for all entries after the removed one
        for offset in self.offsets.iter_mut().skip(idx) {
            *offset -= removed_len;
        }

        true
    }

    /// Rename an entry in the index.
    /// Returns true if the entry was found and renamed.
    pub fn rename_entry(&mut self, old_path: &str, new_path: &str) -> bool {
        // Find the index of the entry with the old path
        let idx = match self.original_paths.iter().position(|p| p == old_path) {
            Some(idx) => idx,
            None => return false,
        };

        // Get the old byte range
        let old_start = self.offsets[idx] as usize;
        let old_end = if idx + 1 < self.offsets.len() {
            self.offsets[idx + 1] as usize
        } else {
            self.normalized_paths.len()
        };
        let old_len = old_end - old_start;

        // Compute new normalized path
        let new_normalized = normalize_path(new_path);
        let new_bytes = new_normalized.as_bytes();
        let new_len = new_bytes.len();

        // Update original path
        self.original_paths[idx] = new_path.to_string();

        // Replace bytes in normalized_paths
        self.normalized_paths
            .splice(old_start..old_end, new_bytes.iter().copied());

        // Update offsets for all entries after this one
        let len_diff = new_len as i64 - old_len as i64;
        if len_diff != 0 {
            for offset in self.offsets.iter_mut().skip(idx + 1) {
                *offset = (*offset as i64 + len_diff) as u32;
            }
        }

        true
    }

    /// Find the ID for a path, if it exists in the index.
    pub fn find_id_by_path(&self, path: &str) -> Option<i64> {
        self.original_paths
            .iter()
            .position(|p| p == path)
            .map(|idx| self.ids[idx])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path() {
        assert_eq!(normalize_path("Café"), "cafe");
        assert_eq!(normalize_path("naïve"), "naive");
        assert_eq!(normalize_path("HELLO"), "hello");
        assert_eq!(normalize_path("résumé"), "resume");
    }

    #[test]
    fn test_build_and_search_single_term() {
        let entries = vec![
            (1, "/docs/report.txt".to_string()),
            (2, "/docs/notes.txt".to_string()),
            (3, "/images/photo.jpg".to_string()),
        ];

        let index = SearchIndex::build_from_entries(entries);
        assert_eq!(index.len(), 3);

        let results = index.search("report");
        assert_eq!(results, vec![1]);

        let results = index.search("docs");
        assert!(results.contains(&1));
        assert!(results.contains(&2));
        assert_eq!(results.len(), 2);

        let results = index.search("nonexistent");
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_multi_term() {
        let entries = vec![
            (1, "/docs/report.txt".to_string()),
            (2, "/docs/notes.txt".to_string()),
            (3, "/images/photo.jpg".to_string()),
        ];

        let index = SearchIndex::build_from_entries(entries);

        // Both terms must match
        let results = index.search("docs report");
        assert_eq!(results, vec![1]);

        let results = index.search("docs txt");
        assert!(results.contains(&1));
        assert!(results.contains(&2));
        assert_eq!(results.len(), 2);

        // No match if one term doesn't exist
        let results = index.search("docs jpg");
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_case_insensitive() {
        let entries = vec![
            (1, "/Docs/Report.TXT".to_string()),
            (2, "/docs/notes.txt".to_string()),
        ];

        let index = SearchIndex::build_from_entries(entries);

        let results = index.search("REPORT");
        assert_eq!(results, vec![1]);

        let results = index.search("docs");
        assert!(results.contains(&1));
        assert!(results.contains(&2));
    }

    #[test]
    fn test_search_with_diacritics() {
        let entries = vec![
            (1, "/docs/café.txt".to_string()),
            (2, "/docs/resume.txt".to_string()),
            (3, "/docs/résumé.pdf".to_string()),
        ];

        let index = SearchIndex::build_from_entries(entries);

        // Search without diacritics matches with diacritics
        let results = index.search("cafe");
        assert_eq!(results, vec![1]);

        // Search for "resume" matches both resume.txt and résumé.pdf
        let results = index.search("resume");
        assert!(results.contains(&2));
        assert!(results.contains(&3));
    }

    #[test]
    fn test_add_entry() {
        let mut index = SearchIndex::new();

        index.add_entry(1, "/docs/file1.txt");
        index.add_entry(2, "/docs/file2.txt");

        assert_eq!(index.len(), 2);

        let results = index.search("file1");
        assert_eq!(results, vec![1]);
    }

    #[test]
    fn test_remove_entry() {
        let entries = vec![
            (1, "/docs/file1.txt".to_string()),
            (2, "/docs/file2.txt".to_string()),
            (3, "/docs/file3.txt".to_string()),
        ];

        let mut index = SearchIndex::build_from_entries(entries);

        assert!(index.remove_entry("/docs/file2.txt"));
        assert_eq!(index.len(), 2);

        let results = index.search("file2");
        assert!(results.is_empty());

        let results = index.search("file1");
        assert_eq!(results, vec![1]);

        let results = index.search("file3");
        assert_eq!(results, vec![3]);

        // Removing non-existent entry returns false
        assert!(!index.remove_entry("/nonexistent"));
    }

    #[test]
    fn test_rename_entry() {
        let entries = vec![
            (1, "/docs/old.txt".to_string()),
            (2, "/docs/other.txt".to_string()),
        ];

        let mut index = SearchIndex::build_from_entries(entries);

        assert!(index.rename_entry("/docs/old.txt", "/docs/new.txt"));

        let results = index.search("old");
        assert!(results.is_empty());

        let results = index.search("new");
        assert_eq!(results, vec![1]);

        // Other entry unaffected
        let results = index.search("other");
        assert_eq!(results, vec![2]);
    }

    #[test]
    fn test_find_id_by_path() {
        let entries = vec![
            (1, "/docs/file1.txt".to_string()),
            (2, "/docs/file2.txt".to_string()),
        ];

        let index = SearchIndex::build_from_entries(entries);

        assert_eq!(index.find_id_by_path("/docs/file1.txt"), Some(1));
        assert_eq!(index.find_id_by_path("/docs/file2.txt"), Some(2));
        assert_eq!(index.find_id_by_path("/nonexistent"), None);
    }

    #[test]
    fn test_empty_query() {
        let entries = vec![(1, "/docs/file.txt".to_string())];
        let index = SearchIndex::build_from_entries(entries);

        let results = index.search("");
        assert!(results.is_empty());

        let results = index.search("   ");
        assert!(results.is_empty());
    }
}
