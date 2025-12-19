import { create } from "zustand";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

interface UploadState {
  uploads: Map<string, UploadItem>;
  addUpload: (item: UploadItem) => void;
  updateProgress: (id: string, progress: number) => void;
  setStatus: (id: string, status: UploadItem["status"], error?: string) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: new Map(),

  addUpload: (item) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.set(item.id, item);
      return { uploads: newUploads };
    }),

  updateProgress: (id, progress) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      const item = newUploads.get(id);
      if (item) {
        newUploads.set(id, { ...item, progress });
      }
      return { uploads: newUploads };
    }),

  setStatus: (id, status, error) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      const item = newUploads.get(id);
      if (item) {
        newUploads.set(id, {
          ...item,
          status,
          error,
          progress: status === "completed" ? 100 : item.progress,
        });
      }
      return { uploads: newUploads };
    }),

  removeUpload: (id) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.delete(id);
      return { uploads: newUploads };
    }),

  clearCompleted: () =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      for (const [id, item] of newUploads) {
        if (item.status === "completed" || item.status === "error") {
          newUploads.delete(id);
        }
      }
      return { uploads: newUploads };
    }),
}));
