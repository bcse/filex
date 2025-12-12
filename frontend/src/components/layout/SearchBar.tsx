import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigationStore } from '@/stores/navigation';
import { useSearch } from '@/hooks/useSearch';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const { setCurrentPath } = useNavigationStore();
  const { data, isLoading } = useSearch(query, showResults);
  
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
      // Navigate to parent directory
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      setCurrentPath(parent);
    }
    setShowResults(false);
    setQuery('');
  }, [setCurrentPath]);
  
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
          className="absolute top-full mt-1 w-96 bg-background border rounded-md shadow-lg z-50 max-h-80 overflow-auto"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : data?.results.length ? (
            <div className="py-1">
              {data.results.map((result) => (
                <button
                  key={result.path}
                  className="w-full px-3 py-2 text-left hover:bg-accent flex flex-col"
                  onClick={() => handleResultClick(result.path, result.is_dir)}
                >
                  <span className="text-sm font-medium truncate">{result.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{result.path}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
