import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useDeferredValue } from 'react';

export function useSearch(query: string, enabled = true) {
  // Debounce the query
  const deferredQuery = useDeferredValue(query);
  
  return useQuery({
    queryKey: ['search', deferredQuery],
    queryFn: () => api.search(deferredQuery),
    enabled: enabled && deferredQuery.length >= 2,
    staleTime: 60_000,
  });
}
