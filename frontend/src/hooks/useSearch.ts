import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/api/client';

export function useSearch(query: string, enabled = true) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce to avoid hammering the API while the user is typing
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: ({ signal }) => api.search(debouncedQuery, { signal }),
    enabled: enabled && debouncedQuery.length >= 2,
    staleTime: 60_000,
  });
}
