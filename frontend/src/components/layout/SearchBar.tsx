import React, { useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigationStore } from '@/stores/navigation';

export function SearchBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { searchQuery, setSearchQuery, setIsSearching, setCurrentPath, currentPath, setSearchOffset } = useNavigationStore();

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchOffset(0, { recordHistory: false });
    setSearchQuery(value);
    setIsSearching(value.length >= 2);
  }, [setIsSearching, setSearchOffset, setSearchQuery]);
  
  const handleClear = useCallback(() => {
    setSearchQuery('', { recordHistory: false });
    setIsSearching(false);
    setCurrentPath(currentPath, { exitSearch: true });
    setSearchOffset(0, { recordHistory: false });
    inputRef.current?.focus();
  }, [currentPath, setCurrentPath, setIsSearching, setSearchOffset, setSearchQuery]);
  
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={handleSearch}
          onFocus={() => setIsSearching(searchQuery.length >= 2)}
          className="pl-9 pr-9 w-64"
        />
        {searchQuery && (
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
    </div>
  );
}
