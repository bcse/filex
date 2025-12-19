import { describe, expect, it, vi } from "vitest";

const setupNavigationStore = async (viewMode?: string) => {
  vi.resetModules();
  localStorage.clear();
  if (viewMode) {
    localStorage.setItem("viewMode", viewMode);
  }
  const mod = await import("./navigation");
  return mod.useNavigationStore;
};

describe("navigation store", () => {
  it("initializes view mode from localStorage", async () => {
    const useNavigationStore = await setupNavigationStore("grid");
    expect(useNavigationStore.getState().viewMode).toBe("grid");
  });

  it("updates view mode and persists it", async () => {
    const useNavigationStore = await setupNavigationStore();
    useNavigationStore.getState().setViewMode("grid");

    expect(useNavigationStore.getState().viewMode).toBe("grid");
    expect(localStorage.getItem("viewMode")).toBe("grid");
  });

  it("handles selection and toggling", async () => {
    const useNavigationStore = await setupNavigationStore();
    const state = useNavigationStore.getState();

    state.selectFile("/a");
    expect(useNavigationStore.getState().selectedFiles.has("/a")).toBe(true);
    expect(useNavigationStore.getState().lastSelected).toBe("/a");

    state.selectFile("/b", true);
    expect(useNavigationStore.getState().selectedFiles.has("/b")).toBe(true);
    expect(useNavigationStore.getState().selectedFiles.size).toBe(2);

    state.toggleSelection("/a");
    expect(useNavigationStore.getState().selectedFiles.has("/a")).toBe(false);
    expect(useNavigationStore.getState().lastSelected).toBe("/b");
  });

  it("selects ranges uniquely and tracks last selection", async () => {
    const useNavigationStore = await setupNavigationStore();
    useNavigationStore.getState().selectRange(["/a", "/b", "/a"]);

    const { selectedFiles, lastSelected } = useNavigationStore.getState();
    expect(selectedFiles.size).toBe(2);
    expect(lastSelected).toBe("/a");
  });

  it("clears selection", async () => {
    const useNavigationStore = await setupNavigationStore();
    useNavigationStore.getState().selectFile("/a");
    useNavigationStore.getState().clearSelection();

    expect(useNavigationStore.getState().selectedFiles.size).toBe(0);
    expect(useNavigationStore.getState().lastSelected).toBeNull();
  });

  it("manages clipboard state", async () => {
    const useNavigationStore = await setupNavigationStore();
    useNavigationStore.getState().copyFiles(["/a"]);

    expect(useNavigationStore.getState().clipboard).toEqual({
      files: ["/a"],
      operation: "copy",
    });

    useNavigationStore.getState().cutFiles(["/b"]);
    expect(useNavigationStore.getState().clipboard).toEqual({
      files: ["/b"],
      operation: "cut",
    });

    useNavigationStore.getState().clearClipboard();
    expect(useNavigationStore.getState().clipboard).toEqual({
      files: [],
      operation: null,
    });
  });

  it("records path history and navigates backward and forward", async () => {
    const useNavigationStore = await setupNavigationStore();
    const state = useNavigationStore.getState();

    state.setCurrentPath("/docs");
    state.setDirectoryOffset(25);

    expect(useNavigationStore.getState().historyIndex).toBe(2);
    expect(useNavigationStore.getState().history.length).toBe(3);

    state.goBack();
    expect(useNavigationStore.getState().currentPath).toBe("/docs");
    expect(useNavigationStore.getState().directoryOffset).toBe(0);

    state.goBack();
    expect(useNavigationStore.getState().currentPath).toBe("/");

    state.goForward();
    expect(useNavigationStore.getState().currentPath).toBe("/docs");
  });

  it("clamps negative directory offsets", async () => {
    const useNavigationStore = await setupNavigationStore();
    useNavigationStore.getState().setDirectoryOffset(-20);

    expect(useNavigationStore.getState().directoryOffset).toBe(0);
  });

  it("does not record search history for short queries", async () => {
    const useNavigationStore = await setupNavigationStore();
    const state = useNavigationStore.getState();

    state.setSearchQuery("a");
    expect(useNavigationStore.getState().history.length).toBe(1);
  });

  it("records search history for valid queries and offsets", async () => {
    const useNavigationStore = await setupNavigationStore();
    const state = useNavigationStore.getState();

    state.setIsSearching(true);
    state.setSearchQuery("docs");
    state.setSearchOffset(40);

    expect(useNavigationStore.getState().history.length).toBe(3);
    expect(useNavigationStore.getState().historyIndex).toBe(2);
    expect(useNavigationStore.getState().searchOffset).toBe(40);
  });

  it("keeps search state when setCurrentPath opts out of exitSearch", async () => {
    const useNavigationStore = await setupNavigationStore();
    const state = useNavigationStore.getState();

    state.setIsSearching(true);
    state.setSearchQuery("docs", { recordHistory: false });
    state.setCurrentPath("/next", { exitSearch: false, recordHistory: false });

    expect(useNavigationStore.getState().isSearching).toBe(true);
    expect(useNavigationStore.getState().searchQuery).toBe("docs");
  });
});
