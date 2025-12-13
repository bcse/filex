import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, X, Loader2, Folder, File, Image, Video, Music, FileText, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigationStore } from '@/stores/navigation';
import { useSearch } from '@/hooks/useSearch';
import { cn } from '@/lib/utils';

type FileFilter = 'all' | 'images' | 'videos' | 'audio' | 'documents';

const FILTER_EXTENSIONS: Record<FileFilter, string[]> = {
  all: [],
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  videos: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
  documents: ['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'],
};

const FILTER_ICONS: Record<FileFilter, React.ComponentType<{ className?: string }>> = {
  all: Filter,
  images: Image,
  videos: Video,
  audio: Music,
  documents: FileText,
};

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FileFilter>('all');
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { setCurrentPath, selectFile } = useNavigationStore();
  const { data, isLoading } = useSearch(query, showResults);

  // Filter results by file type
  const filteredResults = useMemo(() => {
    if (!data?.results || filter === 'all') return data?.results || [];
    const extensions = FILTER_EXTENSIONS[filter];
    return data.results.filter((result) => {
      if (result.is_dir) return false;
      const ext = result.name.split('.').pop()?.toLowerCase() || '';
      return extensions.includes(ext);
    });
  }, [data?.results, filter]);
  
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowResults(e.target.value.length >= 2);
  }, []);
  
  const handleClear = useCallback(() => {
    setQuery('');
    setShowResults(false);
    inputRef.current?.focus();
  }, []);
  
  const handleResultClick = useCallback((path: string, isDir: boolean) => {
    if (isDir) {
      setCurrentPath(path);
    } else {
      // Navigate to parent directory and select the file
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      setCurrentPath(parent);
      // Use setTimeout to ensure the directory loads before selecting
      setTimeout(() => {
        selectFile(path);
      }, 100);
    }
    setShowResults(false);
    setQuery('');
  }, [setCurrentPath, selectFile]);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search files..."
          value={query}
          onChange={handleSearch}
          onFocus={() => query.length >= 2 && setShowResults(true)}
          className="pl-9 pr-9 w-64"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      {/* Search Results Dropdown */}
      {showResults && (
        <div
          ref={resultsRef}
          className="absolute top-full mt-1 w-96 bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col"
        >
          {/* Filter chips */}
          <div className="flex items-center gap-1 px-2 py-2 border-b bg-muted/30">
            {(Object.keys(FILTER_EXTENSIONS) as FileFilter[]).map((filterKey) => {
              const Icon = FILTER_ICONS[filterKey];
              return (
                <button
                  key={filterKey}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md flex items-center gap-1 transition-colors',
                    filter === filterKey
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  )}
                  onClick={() => setFilter(filterKey)}
                >
                  <Icon className="w-3 h-3" />
                  <span className="capitalize">{filterKey}</span>
                </button>
              );
            })}
          </div>

          {/* Results */}
          <div className="overflow-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredResults.length ? (
              <div className="py-1">
                {filteredResults.map((result) => (
                  <button
                    key={result.path}
                    className="w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2"
                    onClick={() => handleResultClick(result.path, result.is_dir)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {result.is_dir ? (
                        <Folder className="w-4 h-4 text-yellow-500" />
                      ) : (
                        <File className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{result.name}</span>
                      <span className="text-xs text-muted-foreground truncate block">{result.path}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {data?.results?.length ? `No ${filter} files found` : 'No results found'}
              </div>
            )}
          </div>

          {/* Results count */}
          {data?.results?.length ? (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30">
              {filteredResults.length} of {data.results.length} results
              {filter !== 'all' && ` (filtered by ${filter})`}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
