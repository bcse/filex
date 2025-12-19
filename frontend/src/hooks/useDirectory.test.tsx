import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useDirectory,
  useTree,
  useCreateDirectory,
  useRename,
  useMove,
  useCopy,
  useDelete,
  useUpload,
  useIndexerStatus,
  useIndexer,
  useUploadWithProgress,
} from "./useDirectory";
import { api } from "@/api/client";
import { useNavigationStore } from "@/stores/navigation";
import { useUploadStore } from "@/stores/upload";
import { toast } from "sonner";

vi.mock("@/api/client", () => ({
  api: {
    listDirectory: vi.fn(),
    getTree: vi.fn(),
    createDirectory: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    getIndexStatus: vi.fn(),
    triggerIndex: vi.fn(),
    uploadWithProgress: vi.fn(),
  },
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: vi.fn(),
}));

vi.mock("@/stores/upload", () => ({
  useUploadStore: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);
const mockedUseNavigationStore = vi.mocked(useNavigationStore);
const mockedUseUploadStore = vi.mocked(useUploadStore);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseNavigationStore.mockReturnValue({
    directoryOffset: 10,
    directoryLimit: 25,
    sortConfig: { field: "mime_type", order: "desc" },
  } as ReturnType<typeof useNavigationStore>);
});

describe("useDirectory", () => {
  it("fetches directory with mapped sort field", async () => {
    mockedApi.listDirectory.mockResolvedValue({} as never);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDirectory("/photos"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.listDirectory).toHaveBeenCalledWith(
      "/photos",
      expect.objectContaining({
        offset: 10,
        limit: 25,
        sort_by: "type",
        sort_order: "desc",
      }),
    );
  });

  it("skips tree fetch when disabled", () => {
    const { wrapper } = createWrapper();
    renderHook(() => useTree("/", false), { wrapper });
    expect(mockedApi.getTree).not.toHaveBeenCalled();
  });

  it("creates directory and invalidates cache", async () => {
    mockedApi.createDirectory.mockResolvedValue({} as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateDirectory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("/docs/new");
    });

    expect(toast.success).toHaveBeenCalledWith('Created folder "new"');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["directory", "/docs"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tree"] });
  });

  it("renames entries and invalidates cache", async () => {
    mockedApi.rename.mockResolvedValue({} as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRename(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ path: "/old", newName: "new" });
    });

    expect(toast.success).toHaveBeenCalledWith('Renamed to "new"');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["directory"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tree"] });
  });

  it("moves entries and reports skip", async () => {
    mockedApi.move.mockResolvedValue({ performed: false } as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMove(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ from: "/a.txt", to: "/b.txt" });
    });

    expect(toast.info).toHaveBeenCalledWith(
      'Skipped moving "a.txt" (already exists)',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["directory"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tree"] });
  });

  it("copies entries without toast when suppressed", async () => {
    mockedApi.copy.mockResolvedValue({ performed: true } as never);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCopy(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        from: "/a.txt",
        to: "/b.txt",
        suppressToast: true,
      });
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("deletes entries and invalidates parent directory", async () => {
    mockedApi.delete.mockResolvedValue({} as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDelete(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("/docs/note.txt");
    });

    expect(toast.success).toHaveBeenCalledWith('Deleted "note.txt"');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["directory", "/docs"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tree"] });
  });

  it("uploads files and reports count", async () => {
    mockedApi.upload.mockResolvedValue({} as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpload(), { wrapper });

    const files = { length: 2 } as FileList;

    await act(async () => {
      await result.current.mutateAsync({ targetPath: "/", files });
    });

    expect(toast.success).toHaveBeenCalledWith("Uploaded 2 files");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["directory", "/"],
    });
  });

  it("polls indexer status", async () => {
    mockedApi.getIndexStatus.mockResolvedValue({} as never);
    const { wrapper } = createWrapper();

    renderHook(() => useIndexerStatus(), { wrapper });

    await waitFor(() => {
      expect(mockedApi.getIndexStatus).toHaveBeenCalled();
    });
  });

  it("triggers indexing and invalidates status", async () => {
    mockedApi.triggerIndex.mockResolvedValue({} as never);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useIndexer(), { wrapper });

    await act(async () => {
      await result.current.triggerIndex.mutateAsync();
    });

    expect(toast.success).toHaveBeenCalledWith("Indexing started");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["indexer-status"],
    });
  });

  it("uploads files with progress and summarizes results", async () => {
    const addUpload = vi.fn();
    const updateProgress = vi.fn();
    const setStatus = vi.fn();
    mockedUseUploadStore.mockReturnValue({
      addUpload,
      updateProgress,
      setStatus,
    } as ReturnType<typeof useUploadStore>);

    mockedApi.uploadWithProgress
      .mockImplementationOnce(async (_path, _file, onProgress) => {
        onProgress(50);
        onProgress(100);
        return {} as never;
      })
      .mockRejectedValueOnce(new Error("Nope"));

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUploadWithProgress(), { wrapper });

    const fileOne = new File(["a"], "a.txt", { type: "text/plain" });
    const fileTwo = new File(["b"], "b.txt", { type: "text/plain" });

    await act(async () => {
      await result.current.uploadFiles("/uploads", [fileOne, fileTwo]);
    });

    expect(addUpload).toHaveBeenCalledTimes(2);
    expect(updateProgress).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(expect.any(String), "uploading");
    expect(setStatus).toHaveBeenCalledWith(expect.any(String), "completed");
    expect(setStatus).toHaveBeenCalledWith(expect.any(String), "error", "Nope");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["directory", "/uploads"],
    });
    expect(toast.warning).toHaveBeenCalledWith("Uploaded 1 file, 1 failed");
  });
});
