import React, { useMemo, useCallback } from 'react';
import {
  Loader2,
  Folder,
  File,
  Image,
  Video,
  Music,
  FileText,
  FileCode,
  Archive,
  FolderOpen,
} from 'lucide-react';
import { buildEntryPath, cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useDirectory } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import { FileContextMenu } from './FileContextMenu';
import type { FileEntry } from '@/types/file';

function isImageFile(entry: FileEntry): boolean {
  return (entry.mime_type || '').startsWith('image/');
}

function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) return Folder;
  const mime = entry.mime_type || '';
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/') || mime.includes('realmedia')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.startsWith('text/') || mime.includes('pdf')) return FileText;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript')) {
    return FileCode;
  }
  return File;
}

export function FileGrid() {
  const {
    currentPath,
    setCurrentPath,
    selectedFiles,
    lastSelected,
    selectFile,
    selectRange,
    toggleSelection,
  } = useNavigationStore();

  const { data, isLoading, error } = useDirectory(currentPath);

  const buildPath = useCallback(
    (entry: FileEntry) => buildEntryPath(entry.name, entry.path, currentPath),
    [currentPath]
  );

  const orderedPaths = useMemo(
    () => (data?.entries || []).map((entry) => buildPath(entry)),
    [data?.entries, buildPath]
  );

  const handleClick = useCallback((entry: FileEntry, e: React.MouseEvent) => {
    const path = buildPath(entry);
    if (e.shiftKey) {
      const anchor = lastSelected && orderedPaths.includes(lastSelected) ? lastSelected : path;
      const start = orderedPaths.indexOf(anchor);
      const end = orderedPaths.indexOf(path);
      if (start !== -1 && end !== -1) {
        const [from, to] = start < end ? [start, end] : [end, start];
        const rangePaths = orderedPaths.slice(from, to + 1);
        selectRange([...Array.from(selectedFiles), ...rangePaths]);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(path);
    } else {
      selectFile(path);
    }
  }, [buildPath, lastSelected, orderedPaths, selectFile, selectRange, selectedFiles, toggleSelection]);

  const handleDoubleClick = useCallback((entry: FileEntry) => {
    const path = buildPath(entry);
    if (entry.is_dir) {
      setCurrentPath(path);
    } else {
      window.open(api.getDownloadUrl(path), '_blank');
    }
  }, [buildPath, setCurrentPath]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error loading directory: {error.message}
      </div>
    );
  }

  const entries = data?.entries || [];

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">This folder is empty</p>
        <p className="text-sm mb-4">Drag and drop files here to upload, or use the toolbar above</p>
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
      {entries.map((entry) => {
        const resolvedPath = buildPath(entry);
        const normalizedEntry = entry.path === resolvedPath ? entry : { ...entry, path: resolvedPath };
        const isSelected = selectedFiles.has(resolvedPath);
        const Icon = getFileIcon(normalizedEntry);
        const showThumbnail = isImageFile(normalizedEntry);

        return (
          <FileContextMenu
            key={resolvedPath}
            entry={normalizedEntry}
            onSelect={() => {
              if (!selectedFiles.has(resolvedPath)) {
                selectFile(resolvedPath);
              }
            }}
          >
            <div
              className={cn(
                'flex flex-col items-center p-3 rounded-lg cursor-pointer transition-colors',
                'hover:bg-accent',
                isSelected && 'bg-accent ring-2 ring-primary'
              )}
              onClick={(e) => handleClick(normalizedEntry, e)}
              onDoubleClick={() => handleDoubleClick(normalizedEntry)}
            >
              {/* Thumbnail or Icon */}
              <div className="w-20 h-20 flex items-center justify-center mb-2 rounded overflow-hidden bg-muted/50">
                {showThumbnail ? (
                  <img
                    src={api.getDownloadUrl(resolvedPath)}
                    alt={normalizedEntry.name}
                    className="max-w-full max-h-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Icon
                    className={cn(
                      'w-10 h-10',
                      entry.is_dir ? 'text-yellow-500' : 'text-muted-foreground'
                    )}
                  />
                )}
              </div>

              {/* File name */}
              <span
                className="text-xs text-center line-clamp-2 break-all w-full"
                title={entry.name}
              >
                {entry.name}
              </span>
            </div>
          </FileContextMenu>
        );
      })}
    </div>
  );
}
