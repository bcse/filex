import React, { useMemo, useCallback } from 'react';
import { Loader2, FolderOpen, Search } from 'lucide-react';
import { FileContextMenu } from '@/components/table/FileContextMenu';
import type { FileEntry } from '@/types/file';
import { useNavigationStore } from '@/stores/navigation';
import { useSearch } from '@/hooks/useSearch';
import { api } from '@/api/client';
import type { SortField } from '@/types/file';
import { searchColumns } from '@/components/table/columns';
import { FileTableView } from '@/components/table/FileTableView';

function toRow(entry: FileEntry): FileEntry {
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
    searchSortConfig,
    setSearchSortConfig,
  } = useNavigationStore();
  const { data, isLoading, error } = useSearch(searchQuery, { enabled: true });
  const rows = useMemo(() => (data?.entries || []).map(toRow), [data?.entries]);

  const handleSort = (field: SortField) => {
    setSearchSortConfig({
      field,
      order: searchSortConfig.field === field && searchSortConfig.order === 'asc' ? 'desc' : 'asc',
    });
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

  return (
    <FileTableView
      columns={searchColumns}
      entries={rows}
      sortConfig={searchSortConfig}
      onSort={(field) => handleSort(field)}
      estimateSize={40}
      selectedPaths={selectedFiles}
      getRowKey={(entry) => entry.path}
      onRowClick={handleRowClick}
      onRowDoubleClick={handleRowDoubleClick}
      wrapRow={(entry, row) => (
        <FileContextMenu
          entry={entry}
          onSelect={() => {
            if (!selectedFiles.has(entry.path)) {
              selectFile(entry.path);
            }
          }}
        >
          {row}
        </FileContextMenu>
      )}
    />
  );
}
