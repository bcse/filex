import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useDirectory(path: string) {
  return useQuery({
    queryKey: ['directory', path],
    queryFn: () => api.listDirectory(path),
    staleTime: 30_000, // Consider data fresh for 30 seconds
  });
}

export function useTree(path: string, enabled = true) {
  return useQuery({
    queryKey: ['tree', path],
    queryFn: () => api.getTree(path),
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateDirectory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (path: string) => api.createDirectory(path),
    onSuccess: (_, path) => {
      // Invalidate parent directory
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ queryKey: ['directory', parent] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
  });
}

export function useRename() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ path, newName }: { path: string; newName: string }) =>
      api.rename(path, newName),
    onSuccess: (_, { path }) => {
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ queryKey: ['directory', parent] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
  });
}

export function useMove() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.move(from, to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
  });
}

export function useDelete() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (path: string) => api.delete(path),
    onSuccess: (_, path) => {
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ queryKey: ['directory', parent] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
  });
}

export function useUpload() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ targetPath, files }: { targetPath: string; files: FileList }) =>
      api.upload(targetPath, files),
    onSuccess: (_, { targetPath }) => {
      queryClient.invalidateQueries({ queryKey: ['directory', targetPath] });
    },
  });
}
