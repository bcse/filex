import React, { useState, useCallback } from 'react';
import { ChevronRight, Home, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from './SearchBar';
import { Toolbar } from './Toolbar';
import { IndexerStatus } from './IndexerStatus';
import { FileTable } from '@/components/table/FileTable';
import { FileGrid } from '@/components/table/FileGrid';
import { UserMenu } from '@/components/auth/UserMenu';
import { SearchResults } from '@/components/search/SearchResults';
import { useNavigationStore } from '@/stores/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUploadWithProgress } from '@/hooks/useDirectory';

export function MainPanel() {
  const { currentPath, setCurrentPath, viewMode, isSearching, searchQuery } = useNavigationStore();
  const { authRequired, logout } = useAuthStore();
  const [isDragging, setIsDragging] = useState(false);
  const { uploadFiles } = useUploadWithProgress();
  const isSearchActive = isSearching && searchQuery.length >= 2;

  // Parse breadcrumb segments
  const segments = currentPath.split('/').filter(Boolean);

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

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        {/* Breadcrumbs / Search label */}
        <div className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPath('/', { exitSearch: true })}
          >
            <Home className="w-4 h-4" />
          </Button>

          {isSearchActive ? (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Search results</span>
              {searchQuery && (
                <span className="text-muted-foreground">for “{searchQuery}”</span>
              )}
            </>
          ) : (
            segments.map((segment, index) => {
              const path = '/' + segments.slice(0, index + 1).join('/');
              const isLast = index === segments.length - 1;
              
              return (
                <React.Fragment key={path}>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  {isLast ? (
                    <span className="font-medium">{segment}</span>
                  ) : (
                    <button
                      className="hover:underline text-muted-foreground hover:text-foreground"
                      onClick={() => setCurrentPath(path)}
                    >
                      {segment}
                    </button>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {!isSearchActive && (
            <>
              <Toolbar />
              <div className="w-px h-6 bg-border" />
              <IndexerStatus />
              {authRequired && logout && (
                <>
                  <div className="w-px h-6 bg-border" />
                  <UserMenu onLogout={logout} />
                </>
              )}
            </>
          )}
          <SearchBar />
        </div>
      </div>
      
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
