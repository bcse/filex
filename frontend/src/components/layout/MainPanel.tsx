import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, ChevronFirst, ChevronLeft, ChevronRight, ChevronLast } from 'lucide-react';
import { FileTable } from '@/components/table/FileTable';
import { FileGrid } from '@/components/table/FileGrid';
import { SearchResults } from '@/components/search/SearchResults';
import { useNavigationStore } from '@/stores/navigation';
import { useUploadWithProgress } from '@/hooks/useDirectory';
import { useDirectory } from '@/hooks/useDirectory';
import { useSearch } from '@/hooks/useSearch';
import { DEFAULT_PAGE_SIZE, PAGINATION_THRESHOLD } from '@/config/pagination';
import { Button } from '@/components/ui/button';

const PAGE_WINDOW = 9; // number of page buttons to display in the pager

export function MainPanel() {
  const {
    currentPath,
    viewMode,
    isSearching,
    searchQuery,
    directoryOffset,
    directoryLimit,
    searchOffset,
    searchLimit,
    setDirectoryOffset,
    setSearchOffset,
  } = useNavigationStore();
  const [isDragging, setIsDragging] = useState(false);
  const { uploadFiles } = useUploadWithProgress();
  const isSearchActive = isSearching && searchQuery.length >= 2;
  const { data: directoryData } = useDirectory(currentPath);
  const { data: searchData } = useSearch(searchQuery, { enabled: isSearchActive });

  // Counter to handle nested elements - dragenter/dragleave fire for each child
  const dragCounterRef = useRef(0);

  // Drag and drop handlers using counter approach
  // See: https://stackoverflow.com/questions/10867506
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files') && dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Reset counter on drop
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await uploadFiles(currentPath, files);
      }
    },
    [currentPath, uploadFiles]
  );
  
  return (
    <div
      className="flex-1 flex flex-col min-w-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="w-12 h-12" />
            <span className="text-lg font-medium">Drop files to upload</span>
          </div>
        </div>
      )}
      
      {/* File Table/Grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isSearchActive ? (
          <SearchResults />
        ) : viewMode === 'table' ? (
          <FileTable />
        ) : (
          <FileGrid />
        )}
      </div>

      <StatusBar
        isSearchActive={isSearchActive}
        total={isSearchActive ? searchData?.total : directoryData?.total}
        offset={isSearchActive ? searchOffset : directoryOffset}
        limit={isSearchActive ? searchLimit : directoryLimit}
        onSetOffset={(next) =>
          isSearchActive ? setSearchOffset(next) : setDirectoryOffset(next)
        }
      />
    </div>
  );
}

function StatusBar({
  isSearchActive,
  total,
  offset,
  limit,
  onSetOffset,
}: {
  isSearchActive: boolean;
  total?: number;
  offset: number;
  limit: number;
  onSetOffset: (offset: number) => void;
}) {
  const showPagination = (total ?? 0) > PAGINATION_THRESHOLD;
  const totalItems = total ?? 0;
  const safeLimit = limit || DEFAULT_PAGE_SIZE;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / safeLimit) : 1;
  const currentPage = totalItems > 0 ? Math.floor(offset / safeLimit) + 1 : 1;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const windowSize = Math.max(1, PAGE_WINDOW);
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    let end = start + windowSize - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - windowSize + 1);
    }

    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(1, page), totalPages);
    onSetOffset((clamped - 1) * safeLimit);
  };

  return (
    <div className="border-t bg-muted/40 px-2 py-2 flex items-center justify-between text-sm">
      {showPagination ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => goToPage(1)} disabled={!hasPrev}>
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={!hasPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageNumbers.map((p) => (
            <Button
              key={p}
              variant={p === currentPage ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => goToPage(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={!hasNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goToPage(totalPages)} disabled={!hasNext}>
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div />
      )}
      <div className="text-muted-foreground">
        {total !== undefined ? `${total} ${isSearchActive ? 'results' : 'items'}` : '—'}
      </div>
    </div>
  );
}
