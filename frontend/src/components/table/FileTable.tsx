import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown, Loader2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useDirectory, useRename, useMove, useCopy } from '@/hooks/useDirectory';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useColumnResize } from '@/hooks/useColumnResize';
import { columns } from './columns';
import { FileContextMenu } from './FileContextMenu';
import { api } from '@/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FileEntry, SortField, SortOrder } from '@/types/file';
import { DropPrompt, DropPromptState, performDropAction } from '@/components/dnd/DropPrompt';

function sortEntries(entries: FileEntry[], field: SortField, order: SortOrder): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    // Directories always first
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
      case 'created':
        comparison = (a.created || '').localeCompare(b.created || '');
        break;
      case 'mime_type':
        comparison = (a.mime_type || '').localeCompare(b.mime_type || '');
        break;
      case 'width':
        comparison = (a.width || 0) - (b.width || 0);
        break;
      case 'height':
        comparison = (a.height || 0) - (b.height || 0);
        break;
      case 'duration':
        comparison = (a.duration || 0) - (b.duration || 0);
        break;
    }
    
    return order === 'asc' ? comparison : -comparison;
  });
  
  return sorted;
}

export function FileTable() {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { handleResizeStart, getGridTemplate, getTotalWidth } = useColumnResize(columns);
  const {
    currentPath,
    setCurrentPath,
    selectedFiles,
    lastSelected,
    selectFile,
    selectRange,
    toggleSelection,
    sortConfig,
    setSortConfig,
    clearSelection,
  } = useNavigationStore();

  const { data, isLoading, error } = useDirectory(currentPath);
  const rename = useRename();
  const move = useMove();
  const copy = useCopy();

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamePath, setRenamePath] = useState('');

  // Drag and drop state
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropPrompt, setDropPrompt] = useState<DropPromptState>(null);
  
  const sortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    return sortEntries(data.entries, sortConfig.field, sortConfig.order);
  }, [data?.entries, sortConfig]);

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
    // Collapse duplicate slashes that might appear when stitching paths
    return withLeadingSlash.replace(/\/+/g, '/');
  }, [currentPath]);

  const normalizedEntries = useMemo(
    () =>
      sortedEntries.map((entry) => {
        const path = buildPath(entry);
        return entry.path === path ? entry : { ...entry, path };
      }),
    [buildPath, sortedEntries]
  );

  const orderedPaths = useMemo(() => normalizedEntries.map((entry) => entry.path), [normalizedEntries]);

  // Handle rename triggered by F2 key
  const handleRenameRequest = useCallback((path: string) => {
    const name = path.split('/').pop() || '';
    setRenamePath(path);
    setRenameValue(name);
    setRenameOpen(true);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renameValue.trim() || !renamePath) return;
    await rename.mutateAsync({ path: renamePath, newName: renameValue.trim() });
    clearSelection();
    setRenameOpen(false);
    setRenamePath('');
    setRenameValue('');
  }, [rename, renamePath, renameValue, clearSelection]);

  // Keyboard navigation
  useKeyboard({
    entries: normalizedEntries,
    onRename: handleRenameRequest,
  });

  const rowVirtualizer = useVirtualizer({
    count: normalizedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });
  
  const handleSort = useCallback((field: SortField) => {
    setSortConfig({
      field,
      order: sortConfig.field === field && sortConfig.order === 'asc' ? 'desc' : 'asc',
    });
  }, [sortConfig, setSortConfig]);

  const handleRowClick = useCallback((entry: FileEntry, e: React.MouseEvent) => {
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
  
  const handleRowDoubleClick = useCallback((entry: FileEntry) => {
    const path = buildPath(entry);
    if (entry.is_dir) {
      setCurrentPath(path);
    } else {
      window.open(api.getDownloadUrl(path), '_blank');
    }
  }, [buildPath, setCurrentPath]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, entry: FileEntry) => {
    const path = buildPath(entry);
    // If the dragged item is selected, drag all selected items
    // Otherwise, just drag this item
    const paths = selectedFiles.has(path)
      ? Array.from(selectedFiles)
      : [path];

    setDraggedPaths(paths);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-file-paths', JSON.stringify(paths));
  }, [buildPath, selectedFiles]);

  const handleDragEnd = useCallback(() => {
    setDraggedPaths([]);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, entry: FileEntry) => {
    const path = buildPath(entry);
    // Only allow dropping on directories that aren't being dragged
    if (!entry.is_dir || draggedPaths.includes(path)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget(path);
  }, [buildPath, draggedPaths]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDropAction = useCallback(async (action: 'move' | 'copy') => {
    await performDropAction({
      action,
      dropPrompt,
      move,
      copy,
      clearSelection,
    });
    setDropPrompt(null);
  }, [clearSelection, copy, dropPrompt, move]);

  const handleDrop = useCallback((e: React.DragEvent, targetEntry: FileEntry) => {
    e.preventDefault();
    setDropTarget(null);

    if (!targetEntry.is_dir) return;
    const targetPath = buildPath(targetEntry);

    const data = e.dataTransfer.getData('application/x-file-paths');
    if (!data) return;

    try {
      const paths: string[] = JSON.parse(data);

      // Don't drop onto self
      if (paths.includes(targetPath)) return;

      setDropPrompt({
        paths,
        targetPath,
        x: e.clientX,
        y: e.clientY,
      });
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [buildPath]);

  const gridTemplate = getGridTemplate();
  const totalWidth = getTotalWidth();

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
  
  return (
    <div className="flex flex-col h-full">
      {/* Scrollable container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="grid px-2 py-2 border-b bg-muted/50 text-sm font-medium sticky top-0 z-10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((column, index) => (
              <div
                key={column.key}
                className="relative flex items-center"
              >
                <div
                  className={cn(
                    'flex items-center gap-1 flex-1 truncate',
                    column.sortable && 'cursor-pointer hover:text-foreground'
                  )}
                  onClick={() => column.sortable && column.key !== 'icon' && handleSort(column.key as SortField)}
                >
                  <span>{column.label}</span>
                  {column.sortable && sortConfig.field === column.key && (
                    sortConfig.order === 'asc' ? (
                      <ArrowUp className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <ArrowDown className="w-3 h-3 flex-shrink-0" />
                    )
                  )}
                </div>
                {/* Resize handle */}
                {index < columns.length - 1 && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 group"
                    onMouseDown={(e) => handleResizeStart(column.key, e)}
                  >
                    <div className="absolute right-0 top-1 bottom-1 w-px bg-border group-hover:bg-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Body */}
          <div ref={parentRef}>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const entry = normalizedEntries[virtualRow.index];
                const resolvedPath = buildPath(entry);
                const normalizedEntry = entry.path === resolvedPath ? entry : { ...entry, path: resolvedPath };
                const isSelected = selectedFiles.has(resolvedPath);

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
                        'grid px-2 items-center text-sm border-b border-transparent hover:bg-accent cursor-pointer absolute top-0 left-0',
                        isSelected && 'bg-accent',
                        dropTarget === resolvedPath && 'bg-primary/20 border-primary border-2',
                        draggedPaths.includes(resolvedPath) && 'opacity-50'
                      )}
                      style={{
                        gridTemplateColumns: gridTemplate,
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        minWidth: totalWidth,
                      }}
                      onClick={(e) => handleRowClick(normalizedEntry, e)}
                      onDoubleClick={() => handleRowDoubleClick(normalizedEntry)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, normalizedEntry)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, normalizedEntry)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, normalizedEntry)}
                    >
                      {columns.map((column) => (
                        <div key={column.key} className="truncate">
                          {column.render(normalizedEntry)}
                        </div>
                      ))}
                    </div>
                  </FileContextMenu>
                );
              })}
            </div>

            {normalizedEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">This folder is empty</p>
                <p className="text-sm mb-4">Drag and drop files here to upload, or use the toolbar above</p>
                <div className="flex gap-2 text-xs">
                  <kbd className="px-2 py-1 bg-muted rounded">Ctrl+V</kbd>
                  <span>to paste</span>
                  <span className="text-muted-foreground/50">|</span>
                  <kbd className="px-2 py-1 bg-muted rounded">Drop files</kbd>
                  <span>to upload</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DropPrompt
        dropPrompt={dropPrompt}
        onClose={() => setDropPrompt(null)}
        onAction={handleDropAction}
      />

      {/* Rename Dialog triggered by F2 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Enter a new name.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="New name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
