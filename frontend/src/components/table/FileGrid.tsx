import React, { useMemo, useCallback } from 'react';
import { Loader2, Folder, File, Image, Video, Music, FileText, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useDirectory } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import { FileContextMenu } from './FileContextMenu';
import type { FileEntry, SortField, SortOrder } from '@/types/file';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java'];

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExtension(filename));
}

function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) return Folder;
  const ext = getFileExtension(entry.name);
  if (IMAGE_EXTENSIONS.includes(ext)) return Image;
  if (VIDEO_EXTENSIONS.includes(ext)) return Video;
  if (AUDIO_EXTENSIONS.includes(ext)) return Music;
  if (TEXT_EXTENSIONS.includes(ext)) return FileText;
  return File;
}

function sortEntries(entries: FileEntry[], field: SortField, order: SortOrder): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) {
      return a.is_dir ? -1 : 1;
    }

    let comparison = 0;
    switch (field) {
      case 'name':
        comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        break;
      case 'size':
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case 'modified':
        comparison = (a.modified || '').localeCompare(b.modified || '');
        break;
      default:
        comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }

    return order === 'asc' ? comparison : -comparison;
  });

  return sorted;
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
    sortConfig,
  } = useNavigationStore();

  const { data, isLoading, error } = useDirectory(currentPath);

  const buildPath = useCallback((entry: FileEntry) => {
    const pathLooksValid =
      entry.path &&
      entry.path !== '/' &&
      entry.path !== '.' &&
      entry.path.includes(entry.name);

    const basePath = pathLooksValid
      ? entry.path
      : `${currentPath === '/' ? '' : currentPath}/${entry.name}`;

    const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
    return withLeadingSlash.replace(/\/+/g, '/');
  }, [currentPath]);

  const sortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    return sortEntries(data.entries, sortConfig.field, sortConfig.order);
  }, [data?.entries, sortConfig]);

  const orderedPaths = useMemo(
    () => sortedEntries.map((entry) => buildPath(entry)),
    [sortedEntries, buildPath]
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

  if (sortedEntries.length === 0) {
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
      {sortedEntries.map((entry) => {
        const resolvedPath = buildPath(entry);
        const normalizedEntry = entry.path === resolvedPath ? entry : { ...entry, path: resolvedPath };
        const isSelected = selectedFiles.has(resolvedPath);
        const Icon = getFileIcon(normalizedEntry);
        const showThumbnail = isImageFile(normalizedEntry.name);

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
