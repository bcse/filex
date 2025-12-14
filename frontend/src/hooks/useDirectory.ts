import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useUploadStore } from '@/stores/upload';

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
    mutationFn: ({
      from,
      to,
      overwrite = false,
      suppressToast,
    }: { from: string; to: string; overwrite?: boolean; suppressToast?: boolean }) =>
      api.move(from, to, overwrite).then((res) => ({ ...res, suppressToast })),
    onSuccess: (data, { from, suppressToast }) => {
      const name = from.split('/').pop();
      if (!suppressToast) {
        if (data?.performed === false) {
          toast.info(`Skipped moving "${name}" (already exists)`);
        } else {
          toast.success(`Moved "${name}"`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to move: ${error.message}`);
    },
  });
}

export function useCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      from,
      to,
      overwrite = false,
      suppressToast,
    }: { from: string; to: string; overwrite?: boolean; suppressToast?: boolean }) =>
      api.copy(from, to, overwrite).then((res) => ({ ...res, suppressToast })),
    onSuccess: (data, { from, suppressToast }) => {
      const name = from.split('/').pop();
      if (!suppressToast) {
        if (data?.performed === false) {
          toast.info(`Skipped copying "${name}" (already exists)`);
        } else {
          toast.success(`Copied "${name}"`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (error) => {
      toast.error(`Failed to copy: ${error.message}`);
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

export function useIndexerStatus() {
  return useQuery({
    queryKey: ['indexer-status'],
    queryFn: () => api.getIndexStatus(),
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 2000,
  });
}

export function useIndexer() {
  const queryClient = useQueryClient();

  const triggerIndex = useMutation({
    mutationFn: () => api.triggerIndex(),
    onSuccess: () => {
      toast.success('Indexing started');
      // Immediately invalidate status to show it's running
      queryClient.invalidateQueries({ queryKey: ['indexer-status'] });
    },
    onError: (error) => {
      toast.error(`Failed to start indexing: ${error.message}`);
    },
  });

  return { triggerIndex };
}

export function useUploadWithProgress() {
  const queryClient = useQueryClient();
  const { addUpload, updateProgress, setStatus } = useUploadStore();

  const uploadFiles = async (targetPath: string, files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Add all files to the upload store
    const uploadItems = fileArray.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending' as const,
    }));

    uploadItems.forEach((item) => addUpload(item));

    // Upload files sequentially (could be parallel with Promise.all if desired)
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const uploadItem = uploadItems[i];

      setStatus(uploadItem.id, 'uploading');

      try {
        await api.uploadWithProgress(targetPath, file, (progress) => {
          updateProgress(uploadItem.id, progress);
        });
        setStatus(uploadItem.id, 'completed');
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setStatus(uploadItem.id, 'error', message);
        errorCount++;
      }
    }

    // Invalidate queries after all uploads
    queryClient.invalidateQueries({ queryKey: ['directory', targetPath] });

    // Show summary toast
    if (successCount > 0 && errorCount === 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}, ${errorCount} failed`);
    } else if (errorCount > 0) {
      toast.error(`Failed to upload ${errorCount} file${errorCount > 1 ? 's' : ''}`);
    }
  };

  return { uploadFiles };
}
