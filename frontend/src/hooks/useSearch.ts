import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { useNavigationStore } from '@/stores/navigation';
import type { SortField } from '@/types/file';

export function useSearch(query: string, options: { enabled?: boolean } = {}) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const { searchOffset, searchLimit, searchSortConfig } = useNavigationStore();

  const mapSortField = (field: SortField) => {
    switch (field) {
      case 'mime_type':
        return 'type';
      case 'width':
      case 'height':
        return 'dimensions';
      default:
        return field;
    }
  };

  // Debounce to avoid hammering the API while the user is typing
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  return useQuery({
    queryKey: [
      'search',
      debouncedQuery,
      searchOffset,
      searchLimit,
      searchSortConfig.field,
      searchSortConfig.order,
    ],
    queryFn: ({ signal }) =>
      api.search(debouncedQuery, {
        signal,
        offset: searchOffset,
        limit: searchLimit,
        sort_by: mapSortField(searchSortConfig.field),
        sort_order: searchSortConfig.order,
      }),
    enabled: (options.enabled ?? true) && debouncedQuery.length >= 2,
    staleTime: 60_000,
  });
}
