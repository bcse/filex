use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::models::{FileEntry, TreeNode};

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

pub struct FilesystemService {
    root: PathBuf,
}

pub struct OperationResult {
    pub path: String,
    pub performed: bool,
}

impl FilesystemService {
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
            let entry = entry?;
            let metadata = entry.metadata()?;

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

    /// Get directory tree for sidebar (single level, lazy loaded)
    pub fn get_tree_node(&self, relative_path: &str) -> Result<Vec<TreeNode>, FsError> {
        let path = self.resolve_path(relative_path)?;

        if !path.is_dir() {
            return Err(FsError::NotADirectory(relative_path.to_string()));
        }

        let mut nodes = Vec::new();

        for entry in fs::read_dir(&path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;

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
                children: None,
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

        fs::rename(&source, &dest_path)?;

        Ok(OperationResult {
            path: self.relative_path(&dest_path),
            performed: true,
        })
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
                    fs::copy(&child_source, &child_dest)?;
                }
            }
        } else {
            fs::copy(&source, &dest)?;
        }

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
