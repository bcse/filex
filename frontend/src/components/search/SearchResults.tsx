import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, FolderOpen, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileContextMenu } from '@/components/table/FileContextMenu';
import type { FileEntry } from '@/types/file';
import { useNavigationStore } from '@/stores/navigation';
import { useSearch } from '@/hooks/useSearch';
import { useColumnResize } from '@/hooks/useColumnResize';
import { api } from '@/api/client';
import type { SortField, SortOrder } from '@/types/file';
import { searchColumns } from '@/components/table/columns';

function toRow(entry: FileEntry) {
  return {
    name: entry.name,
    path: entry.path,
    is_dir: entry.is_dir,
    size: entry.size ?? undefined,
    created: entry.created,
    modified: entry.modified,
    mime_type: entry.mime_type ?? undefined,
    width: entry.width ?? undefined,
    height: entry.height ?? undefined,
    duration: entry.duration ?? undefined,
  };
}

export function SearchResults() {
  const {
    searchQuery,
    setIsSearching,
    selectedFiles,
    lastSelected,
    selectFile,
    selectRange,
    toggleSelection,
    setCurrentPath,
  } = useNavigationStore();
  const { data, isLoading, error } = useSearch(searchQuery, true);
  const parentRef = useRef<HTMLDivElement>(null);
  const { handleResizeStart, getGridTemplate, getTotalWidth } = useColumnResize(searchColumns);
  const [sortConfig, setSortConfig] = useState<{ field: SortField | 'path'; order: SortOrder }>({
    field: 'name',
    order: 'asc',
  });

  const rows = useMemo(() => {
    const unsorted = (data?.results || []).map(toRow);
    const sorted = [...unsorted].sort((a, b) => {
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }

      let comparison = 0;
      switch (sortConfig.field) {
        case 'name':
          comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        case 'path':
          comparison = a.path.toLowerCase().localeCompare(b.path.toLowerCase());
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = (a.modified || '').localeCompare(b.modified || '');
          break;
        case 'mime_type':
          comparison = (a.mime_type || '').localeCompare(b.mime_type || '');
          break;
        default:
          comparison = 0;
      }

      return sortConfig.order === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [data?.results, sortConfig]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const handleSort = (field: SortField | 'path') => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleRowClick = useCallback(
    (row: ReturnType<typeof toRow>, e: React.MouseEvent) => {
      if (e.shiftKey) {
        const paths = rows.map((item) => item.path);
        const anchor = lastSelected && paths.includes(lastSelected) ? lastSelected : row.path;
        const start = paths.indexOf(anchor);
        const end = paths.indexOf(row.path);
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const rangePaths = paths.slice(from, to + 1);
          selectRange([...Array.from(selectedFiles), ...rangePaths]);
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        toggleSelection(row.path);
      } else {
        selectFile(row.path);
      }
    },
    [lastSelected, rows, selectFile, selectRange, selectedFiles, toggleSelection]
  );

  const handleRowDoubleClick = useCallback(
    (row: ReturnType<typeof toRow>) => {
      if (row.is_dir) {
        setIsSearching(false);
        setCurrentPath(row.path);
      } else {
        window.open(api.getDownloadUrl(row.path), '_blank');
      }
    },
    [setCurrentPath, setIsSearching]
  );

  if (!searchQuery || searchQuery.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Search className="w-10 h-10 mb-2 opacity-60" />
        <p className="text-sm">Type to search files</p>
      </div>
    );
  }

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
        Error searching: {(error as Error).message}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-base font-medium">No results</p>
        <p className="text-sm">Try a different query.</p>
      </div>
    );
  }

  const gridTemplate = getGridTemplate();
  const totalWidth = getTotalWidth();

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable container */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="grid px-2 py-2 border-b bg-muted/40 text-sm font-medium sticky top-0 z-10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {searchColumns.map((column, index) => {
              const isSortable = column.sortable && column.key !== 'icon';
              const isActive = sortConfig.field === column.key;
              return (
                <div
                  key={column.key}
                  className="relative flex items-center"
                >
                  <div
                    className={cn(
                      'flex items-center gap-1 flex-1 truncate',
                      isSortable && 'cursor-pointer hover:text-foreground'
                    )}
                    onClick={() => isSortable && handleSort(column.key as SortField)}
                  >
                    <span>{column.label}</span>
                    {isSortable && isActive && (
                      sortConfig.order === 'asc' ? (
                        <ArrowUp className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 flex-shrink-0" />
                      )
                    )}
                  </div>
                  {/* Resize handle */}
                  {index < searchColumns.length - 1 && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 group"
                      onMouseDown={(e) => handleResizeStart(column.key, e)}
                    >
                      <div className="absolute right-0 top-1 bottom-1 w-px bg-border group-hover:bg-primary" />
                    </div>
                  )}
                </div>
              );
            })}
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
                const row = rows[virtualRow.index];
                const isSelected = selectedFiles.has(row.path);
                const entry: FileEntry = row;

                return (
                  <FileContextMenu
                    key={row.path}
                    entry={entry}
                    onSelect={() => {
                      if (!selectedFiles.has(row.path)) {
                        selectFile(row.path);
                      }
                    }}
                  >
                    <div
                      className={cn(
                        'grid px-2 items-center text-sm border-b border-transparent hover:bg-accent cursor-pointer absolute top-0 left-0',
                        isSelected && 'bg-accent'
                      )}
                      style={{
                        gridTemplateColumns: gridTemplate,
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        minWidth: totalWidth,
                      }}
                      onClick={(e) => handleRowClick(row, e)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      {searchColumns.map((column) => (
                        <div key={column.key} className="truncate">
                          {column.render(entry)}
                        </div>
                      ))}
                    </div>
                  </FileContextMenu>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
