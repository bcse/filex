import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      const name = path.split('/').pop();
      toast.success(`Created folder "${name}"`);
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ queryKey: ['directory', parent] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to create folder: ${error.message}`);
    },
  });
}

export function useRename() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, newName }: { path: string; newName: string }) =>
      api.rename(path, newName),
    onSuccess: (_, { newName }) => {
      toast.success(`Renamed to "${newName}"`);
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to rename: ${error.message}`);
    },
  });
}

export function useMove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.move(from, to),
    onSuccess: (_, { from }) => {
      const name = from.split('/').pop();
      toast.success(`Moved "${name}"`);
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to move: ${error.message}`);
    },
  });
}

export function useDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => api.delete(path),
    onSuccess: (_, path) => {
      const name = path.split('/').pop();
      toast.success(`Deleted "${name}"`);
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ queryKey: ['directory', parent] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetPath, files }: { targetPath: string; files: FileList }) =>
      api.upload(targetPath, files),
    onSuccess: (_, { files, targetPath }) => {
      toast.success(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['directory', targetPath] });
    },
    onError: (error) => {
      toast.error(`Failed to upload: ${error.message}`);
    },
  });
}
