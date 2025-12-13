import React, { useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';
import { FileTable } from '@/components/table/FileTable';
import { FileGrid } from '@/components/table/FileGrid';
import { SearchResults } from '@/components/search/SearchResults';
import { useNavigationStore } from '@/stores/navigation';
import { useUploadWithProgress } from '@/hooks/useDirectory';

export function MainPanel() {
  const { currentPath, viewMode, isSearching, searchQuery } = useNavigationStore();
  const [isDragging, setIsDragging] = useState(false);
  const { uploadFiles } = useUploadWithProgress();
  const isSearchActive = isSearching && searchQuery.length >= 2;

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
    </div>
  );
}
