import React, { useMemo, useCallback, useState } from 'react';
import { Loader2, FolderOpen } from 'lucide-react';
import { buildEntryPath, cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useDirectory, useRename, useMove, useCopy } from '@/hooks/useDirectory';
import { useKeyboard } from '@/hooks/useKeyboard';
import { columns } from './columns';
import { FileContextMenu } from './FileContextMenu';
import { api } from '@/api/client';
import { RenameDialog } from '@/components/dialogs/RenameDialog';
import type { FileEntry, SortField } from '@/types/file';
import { DropPrompt, DropPromptState, DropAction } from '@/components/dnd/DropPrompt';
import { performDropAction } from '@/components/dnd/dropActions';
import { FileTableView } from '@/components/table/FileTableView';

export function FileTable() {
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
    pendingFocusPath,
    setPendingFocusPath,
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
  
  const serverEntries = useMemo(() => data?.entries || [], [data?.entries]);

  const buildPath = useCallback(
    (entry: FileEntry) => buildEntryPath(entry.name, entry.path, currentPath),
    [currentPath]
  );

  const normalizedEntries = useMemo(
    () =>
      serverEntries.map((entry) => {
        const path = buildPath(entry);
        return entry.path === path ? entry : { ...entry, path };
      }),
    [buildPath, serverEntries]
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

  const handleDropAction = useCallback(async (action: DropAction) => {
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

  const getRowProps = useCallback((entry: FileEntry) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => handleDragStart(event, entry),
    onDragEnd: handleDragEnd,
    onDragOver: (event: React.DragEvent) => handleDragOver(event, entry),
    onDragLeave: handleDragLeave,
    onDrop: (event: React.DragEvent) => handleDrop(event, entry),
  }), [handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop]);

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
    <>
      <FileTableView
        columns={columns}
        entries={normalizedEntries}
        sortConfig={sortConfig}
        onSort={handleSort}
        selectedPaths={selectedFiles}
        getRowKey={buildPath}
        scrollToKey={pendingFocusPath}
        onScrolledToKey={(key) => {
          if (pendingFocusPath === key) {
            setPendingFocusPath(null);
          }
        }}
        getRowClassName={(entry) => {
          const resolvedPath = buildPath(entry);
          return cn(
            dropTarget === resolvedPath && 'bg-primary/20 border-primary border-2',
            draggedPaths.includes(resolvedPath) && 'opacity-50'
          );
        }}
        getRowProps={getRowProps}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        wrapRow={(entry, row) => {
          const resolvedPath = buildPath(entry);
          return (
            <FileContextMenu
              entry={entry}
              onSelect={() => {
                if (!selectedFiles.has(resolvedPath)) {
                  selectFile(resolvedPath);
                }
              }}
            >
              {row}
            </FileContextMenu>
          );
        }}
        afterRows={
          normalizedEntries.length === 0 && (
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
          )
        }
      />

      <DropPrompt
        dropPrompt={dropPrompt}
        onClose={() => setDropPrompt(null)}
        onAction={handleDropAction}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onConfirm={handleConfirmRename}
      />
    </>
  );
}
