import React, { useState, useCallback } from 'react';
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

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
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
