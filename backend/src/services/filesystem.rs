use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::models::{FileEntry, TreeNode};

/// Error variants returned by `FilesystemService` when a requested path cannot
/// be handled safely inside the configured root.
#[derive(Error, Debug)]
pub enum FsError {
    #[error("Path not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Path escapes root directory")]
    PathEscape,

    #[error("Not a directory: {0}")]
    NotADirectory(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Provides file-management operations that are confined to a single root
/// directory to prevent directory traversal or accidental access elsewhere on
/// disk.
pub struct FilesystemService {
    root: PathBuf,
}

/// Outcome of a move or copy operation, including whether it was executed and
/// the resulting relative path if applicable.
pub struct OperationResult {
    pub path: String,
    pub performed: bool,
}

impl FilesystemService {
    /// Create a new service rooted at `root`, canonicalizing the path up front
    /// so later resolution checks compare against a normalized base.
    pub fn new(root: PathBuf) -> Self {
        // Normalize the root path up front so relative paths strip correctly
        let root = root.canonicalize().unwrap_or(root);
        Self { root }
    }

    /// Resolve and validate a path, ensuring it doesn't escape root
    pub fn resolve_path(&self, relative_path: &str) -> Result<PathBuf, FsError> {
        let path = if relative_path.is_empty() || relative_path == "/" {
            self.root.clone()
        } else {
            let clean_path = relative_path.trim_start_matches('/');
            self.root.join(clean_path)
        };

        // Canonicalize and check it's under root
        let canonical = path.canonicalize().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                FsError::NotFound(relative_path.to_string())
            } else if e.kind() == std::io::ErrorKind::PermissionDenied {
                FsError::PermissionDenied(relative_path.to_string())
            } else {
                FsError::Io(e)
            }
        })?;

        let root_canonical = self.root.canonicalize()?;

        if !canonical.starts_with(&root_canonical) {
            return Err(FsError::PathEscape);
        }

        Ok(canonical)
    }

    /// Get relative path from root
    pub fn relative_path(&self, absolute: &Path) -> String {
        let absolute = absolute
            .canonicalize()
            .unwrap_or_else(|_| absolute.to_path_buf());

        absolute
            .strip_prefix(&self.root)
            .map(|p| format!("/{}", p.display()))
            .unwrap_or_else(|_| "/".to_string())
    }

    /// List directory contents
    pub fn list_directory(&self, relative_path: &str) -> Result<Vec<FileEntry>, FsError> {
        let path = self.resolve_path(relative_path)?;

        if !path.is_dir() {
            return Err(FsError::NotADirectory(relative_path.to_string()));
        }

        let mut entries = Vec::new();

        for entry in fs::read_dir(&path)? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue, // Skip entries we can't read
            };
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue, // Skip entries with unreadable metadata
            };

            let file_path = entry.path();
            let relative = self.relative_path(&file_path);

            let mime_type = if metadata.is_file() {
                mime_guess::from_path(&file_path)
                    .first()
                    .map(|m| m.to_string())
            } else {
                None
            };

            entries.push(FileEntry {
                id: None,
                name: entry.file_name().to_string_lossy().to_string(),
                path: relative,
                is_dir: metadata.is_dir(),
                size: if metadata.is_file() {
                    Some(metadata.len())
                } else {
                    None
                },
                created: metadata.created().ok().map(|t| DateTime::<Utc>::from(t)),
                modified: metadata.modified().ok().map(|t| DateTime::<Utc>::from(t)),
                mime_type,
                width: None,
                height: None,
                duration: None,
                indexed_at: None,
            });
        }

        // Sort: directories first, then by name
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    }

    /// Get directory tree for sidebar (single level, lazy loaded).
    pub fn get_tree_node(&self, relative_path: &str) -> Result<Vec<TreeNode>, FsError> {
        let path = self.resolve_path(relative_path)?;

        if !path.is_dir() {
            return Err(FsError::NotADirectory(relative_path.to_string()));
        }

        let mut nodes = Vec::new();

        for entry in fs::read_dir(&path)? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if !metadata.is_dir() {
                continue;
            }

            let file_path = entry.path();
            let relative = self.relative_path(&file_path);

            // Check if this directory has subdirectories
            let has_children = fs::read_dir(&file_path)
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .any(|e| e.metadata().map(|m| m.is_dir()).unwrap_or(false))
                })
                .unwrap_or(false);

            nodes.push(TreeNode {
                name: entry.file_name().to_string_lossy().to_string(),
                path: relative,
                has_children,
            });
        }

        nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        Ok(nodes)
    }

    /// Create a new directory
    pub fn create_directory(&self, relative_path: &str) -> Result<(), FsError> {
        let parent = Path::new(relative_path).parent().unwrap_or(Path::new("/"));
        let parent_resolved = self.resolve_path(&parent.to_string_lossy())?;
        let root_canonical = self.root.canonicalize()?;

        let new_dir = parent_resolved.join(
            Path::new(relative_path)
                .file_name()
                .ok_or_else(|| FsError::NotFound(relative_path.to_string()))?,
        );

        // Verify it would be under root
        if !new_dir.starts_with(&root_canonical) {
            return Err(FsError::PathEscape);
        }

        fs::create_dir(&new_dir)?;
        Ok(())
    }

    /// Delete a file or directory
    pub fn delete(&self, relative_path: &str) -> Result<(), FsError> {
        let path = self.resolve_path(relative_path)?;

        // Don't allow deleting root
        if path == self.root {
            return Err(FsError::PermissionDenied("Cannot delete root".to_string()));
        }

        if path.is_dir() {
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
        }

        Ok(())
    }

    /// Rename a file or directory
    pub fn rename(&self, relative_path: &str, new_name: &str) -> Result<String, FsError> {
        let path = self.resolve_path(relative_path)?;

        // Don't allow renaming root
        if path == self.root {
            return Err(FsError::PermissionDenied("Cannot rename root".to_string()));
        }

        let parent = path
            .parent()
            .ok_or_else(|| FsError::NotFound(relative_path.to_string()))?;
        let new_path = parent.join(new_name);

        fs::rename(&path, &new_path)?;

        Ok(self.relative_path(&new_path))
    }

    /// Move a file or directory
    pub fn move_entry(
        &self,
        from: &str,
        to_dir: &str,
        overwrite: bool,
    ) -> Result<OperationResult, FsError> {
        let source = self.resolve_path(from)?;
        let file_name = source
            .file_name()
            .ok_or_else(|| FsError::NotFound(from.to_string()))?;
        let dest_path = self.build_destination_path(to_dir, file_name)?;

        // Prevent moving root
        if source == self.root {
            return Err(FsError::PermissionDenied("Cannot move root".to_string()));
        }

        // Prevent moving a directory into itself
        if source.is_dir() && dest_path.starts_with(&source) {
            return Err(FsError::PermissionDenied(
                "Cannot move a directory into itself".to_string(),
            ));
        }

        if dest_path.exists() {
            if overwrite {
                if dest_path.is_dir() {
                    fs::remove_dir_all(&dest_path)?;
                } else {
                    fs::remove_file(&dest_path)?;
                }
            } else {
                return Ok(OperationResult {
                    path: self.relative_path(&dest_path),
                    performed: false,
                });
            }
        }

        self.move_file_contents(&source, &dest_path)?;

        Ok(OperationResult {
            path: self.relative_path(&dest_path),
            performed: true,
        })
    }

    /// Move a file or directory, falling back to copy+delete for cross-device moves.
    fn move_file_contents(&self, source: &Path, dest: &Path) -> Result<(), FsError> {
        match fs::rename(source, dest) {
            Ok(()) => Ok(()),
            Err(e) if e.raw_os_error() == Some(18) => {
                // EXDEV (18): cross-device link not permitted, fall back to copy+delete
                self.copy_recursive(source, dest)?;
                if source.is_dir() {
                    fs::remove_dir_all(source)?;
                } else {
                    fs::remove_file(source)?;
                }
                Ok(())
            }
            Err(e) => Err(FsError::Io(e)),
        }
    }

    /// Copy a file or directory recursively
    pub fn copy_entry(
        &self,
        from: &str,
        to_dir: &str,
        overwrite: bool,
    ) -> Result<OperationResult, FsError> {
        let source = self.resolve_path(from)?;
        let file_name = source
            .file_name()
            .ok_or_else(|| FsError::NotFound(from.to_string()))?;
        let dest_path = self.build_destination_path(to_dir, file_name)?;

        // Prevent copying a directory into itself or its descendant
        if source.is_dir() && dest_path.starts_with(&source) {
            return Err(FsError::PermissionDenied(
                "Cannot copy a directory into itself".to_string(),
            ));
        }

        if dest_path.exists() {
            if overwrite {
                if dest_path.is_dir() {
                    fs::remove_dir_all(&dest_path)?;
                } else {
                    fs::remove_file(&dest_path)?;
                }
            } else {
                return Ok(OperationResult {
                    path: self.relative_path(&dest_path),
                    performed: false,
                });
            }
        }

        self.copy_recursive(&source, &dest_path)?;

        Ok(OperationResult {
            path: self.relative_path(&dest_path),
            performed: true,
        })
    }

    fn copy_recursive(&self, source: &Path, dest: &Path) -> Result<(), FsError> {
        if source.is_dir() {
            fs::create_dir(&dest)?;
            for entry in fs::read_dir(source)? {
                let entry = entry?;
                let file_type = entry.file_type()?;
                let child_source = entry.path();
                let child_dest = dest.join(entry.file_name());

                if file_type.is_dir() {
                    self.copy_recursive(&child_source, &child_dest)?;
                } else {
                    Self::copy_file_contents(&child_source, &child_dest)?;
                }
            }
        } else {
            Self::copy_file_contents(source, dest)?;
        }

        Ok(())
    }

    /// Copy file contents without copying permissions.
    /// This avoids "Operation not permitted" errors when copying across
    /// different filesystem types (e.g., SAMBA to local).
    fn copy_file_contents(source: &Path, dest: &Path) -> Result<(), FsError> {
        let mut src_file = fs::File::open(source)?;
        let mut dest_file = fs::File::create(dest)?;
        std::io::copy(&mut src_file, &mut dest_file)?;
        Ok(())
    }

    /// Build a destination path for move/copy operations that may not yet exist.
    /// Accepts a target path that can point to a directory (existing) or a full path (non-existing).
    fn build_destination_path(
        &self,
        target: &str,
        file_name: &std::ffi::OsStr,
    ) -> Result<PathBuf, FsError> {
        let root_canonical = self.root.canonicalize()?;
        let clean_target = target.trim_start_matches('/');
        let candidate = self.root.join(clean_target);

        let parent = candidate
            .parent()
            .ok_or_else(|| FsError::NotFound(target.to_string()))?;
        let parent_canonical = parent.canonicalize().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                FsError::NotFound(target.to_string())
            } else if e.kind() == std::io::ErrorKind::PermissionDenied {
                FsError::PermissionDenied(target.to_string())
            } else {
                FsError::Io(e)
            }
        })?;

        if !parent_canonical.starts_with(&root_canonical) {
            return Err(FsError::PathEscape);
        }

        // If target already exists and is a directory, put the file inside it
        if candidate.exists() && candidate.is_dir() {
            return Ok(candidate.join(file_name));
        }

        Ok(candidate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn service_with_root() -> (FilesystemService, tempfile::TempDir, PathBuf) {
        let tmp = tempdir().expect("tempdir should create");
        let root = tmp.path().join("root");
        fs::create_dir(&root).unwrap();
        (FilesystemService::new(root.clone()), tmp, root)
    }

    #[test]
    fn resolve_path_rejects_escape_and_allows_root() -> Result<(), FsError> {
        let (service, tmp, root) = service_with_root();

        // Outside directory to ensure canonicalization succeeds
        let outside = tmp.path().join("outside");
        fs::create_dir(&outside).unwrap();

        let root_path = service.resolve_path("/")?;
        assert_eq!(root_path, root.canonicalize().unwrap());

        let err = service.resolve_path("../outside").unwrap_err();
        assert!(matches!(err, FsError::PathEscape));

        Ok(())
    }

    #[test]
    fn basic_file_operations_work() -> Result<(), FsError> {
        let (service, _tmp, root) = service_with_root();

        service.create_directory("/new_dir")?;
        let nested_dir = root.join("new_dir");
        assert!(nested_dir.exists());

        let file_path = nested_dir.join("file.txt");
        fs::write(&file_path, b"hello").unwrap();

        let renamed_path = service.rename("/new_dir/file.txt", "renamed.txt")?;
        assert_eq!(renamed_path, "/new_dir/renamed.txt");
        assert!(nested_dir.join("renamed.txt").exists());

        service.delete("/new_dir/renamed.txt")?;
        assert!(!nested_dir.join("renamed.txt").exists());

        Ok(())
    }

    #[test]
    fn move_and_copy_respect_overwrite() -> Result<(), FsError> {
        let (service, _tmp, root) = service_with_root();
        let dir_a = root.join("a");
        let dir_b = root.join("b");
        fs::create_dir_all(&dir_a).unwrap();
        fs::create_dir_all(&dir_b).unwrap();

        let source_file = dir_a.join("file.txt");
        fs::write(&source_file, b"from_a").unwrap();

        let dest_file = dir_b.join("file.txt");
        fs::write(&dest_file, b"existing").unwrap();

        let result = service.move_entry("/a/file.txt", "/b", false)?;
        assert!(!result.performed);
        assert!(source_file.exists());
        assert_eq!(fs::read_to_string(&dest_file).unwrap(), "existing");

        let result = service.move_entry("/a/file.txt", "/b", true)?;
        assert!(result.performed);
        assert!(!source_file.exists());
        assert_eq!(fs::read_to_string(&dest_file).unwrap(), "from_a");

        let dest_dir = root.join("c");
        fs::create_dir_all(&dest_dir).unwrap();
        // Copy the file back into a new directory
        let result = service.copy_entry("/b/file.txt", "/c/copied.txt", false)?;
        assert!(result.performed);
        let copied_file = root.join("c").join("copied.txt");
        assert_eq!(fs::read_to_string(&copied_file).unwrap(), "from_a");

        Ok(())
    }
}
