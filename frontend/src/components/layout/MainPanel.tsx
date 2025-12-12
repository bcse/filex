import React from 'react';
import { ChevronRight, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from './SearchBar';
import { FileTable } from '@/components/table/FileTable';
import { useNavigationStore } from '@/stores/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function MainPanel() {
  const { currentPath, setCurrentPath } = useNavigationStore();
  const queryClient = useQueryClient();
  
  // Parse breadcrumb segments
  const segments = currentPath.split('/').filter(Boolean);
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['directory', currentPath] });
  };
  
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPath('/')}
          >
            <Home className="w-4 h-4" />
          </Button>
          
          {segments.map((segment, index) => {
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
          })}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <SearchBar />
        </div>
      </div>
      
      {/* File Table */}
      <div className="flex-1 min-h-0">
        <FileTable />
      </div>
    </div>
  );
}
