import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useDirectory, useRename } from '@/hooks/useDirectory';
import { useKeyboard } from '@/hooks/useKeyboard';
import { columns } from './columns';
import { FileContextMenu } from './FileContextMenu';
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
  const {
    currentPath,
    setCurrentPath,
    selectedFiles,
    selectFile,
    toggleSelection,
    sortConfig,
    setSortConfig,
    clearSelection,
  } = useNavigationStore();

  const { data, isLoading, error } = useDirectory(currentPath);
  const rename = useRename();

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamePath, setRenamePath] = useState('');
  
  const sortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    return sortEntries(data.entries, sortConfig.field, sortConfig.order);
  }, [data?.entries, sortConfig]);

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
    entries: sortedEntries,
    onRename: handleRenameRequest,
  });

  const rowVirtualizer = useVirtualizer({
    count: sortedEntries.length,
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
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(entry.path);
    } else {
      selectFile(entry.path);
    }
  }, [selectFile, toggleSelection]);
  
  const handleRowDoubleClick = useCallback((entry: FileEntry) => {
    if (entry.is_dir) {
      setCurrentPath(entry.path);
    } else {
      // TODO: Preview or download
      window.open(`/api/files/download?path=${encodeURIComponent(entry.path)}`, '_blank');
    }
  }, [setCurrentPath]);
  
  const gridTemplate = columns.map(c => c.width).join(' ');
  
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
      {/* Header */}
      <div
        className="grid gap-2 px-2 py-2 border-b bg-muted/50 text-sm font-medium"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              'flex items-center gap-1',
              column.sortable && 'cursor-pointer hover:text-foreground'
            )}
            onClick={() => column.sortable && column.key !== 'icon' && handleSort(column.key as SortField)}
          >
            <span>{column.label}</span>
            {column.sortable && sortConfig.field === column.key && (
              sortConfig.order === 'asc' ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            )}
          </div>
        ))}
      </div>
      
      {/* Body */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = sortedEntries[virtualRow.index];
            const isSelected = selectedFiles.has(entry.path);

            return (
              <FileContextMenu
                key={entry.path}
                entry={entry}
                onSelect={() => {
                  if (!selectedFiles.has(entry.path)) {
                    selectFile(entry.path);
                  }
                }}
              >
                <div
                  className={cn(
                    'grid gap-2 px-2 items-center text-sm border-b border-transparent hover:bg-accent cursor-pointer absolute top-0 left-0 w-full',
                    isSelected && 'bg-accent'
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={(e) => handleRowClick(entry, e)}
                  onDoubleClick={() => handleRowDoubleClick(entry)}
                >
                  {columns.map((column) => (
                    <div key={column.key} className="truncate">
                      {column.render(entry)}
                    </div>
                  ))}
                </div>
              </FileContextMenu>
            );
          })}
        </div>
        
        {sortedEntries.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            This folder is empty
          </div>
        )}
      </div>

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
