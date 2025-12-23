import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useKeyboard } from "./useKeyboard";
import { useNavigationStore } from "@/stores/navigation";
import { api } from "@/api/client";
import { isTauri, resolveLocalPath } from "@/lib/config";
import { isMacOS, quickLook } from "@/lib/tauri";
import type { FileEntry } from "@/types/file";

const moveMock = vi.fn();
const copyMock = vi.fn();

vi.mock("@/hooks/useDirectory", () => ({
  useMove: () => ({ mutateAsync: moveMock }),
  useCopy: () => ({ mutateAsync: copyMock }),
}));

vi.mock("@/api/client", () => ({
  api: {
    getDownloadUrl: vi.fn(),
  },
}));

vi.mock("@/lib/config", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...actual,
    isTauri: vi.fn(),
    resolveLocalPath: vi.fn(),
  };
});

vi.mock("@/lib/tauri", () => ({
  openLocalPath: vi.fn(),
  quickLook: vi.fn(),
  quickLookRefresh: vi.fn(),
  quickLookIsVisible: vi.fn().mockResolvedValue(false),
  isMacOS: vi.fn(),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: vi.fn(),
}));

const mockedUseNavigationStore = vi.mocked(useNavigationStore);
const mockedApi = vi.mocked(api);
const mockedIsTauri = vi.mocked(isTauri);
const mockedResolveLocalPath = vi.mocked(resolveLocalPath);
const mockedIsMacOS = vi.mocked(isMacOS);
const mockedQuickLook = vi.mocked(quickLook);

describe("useKeyboard", () => {
  const entries: FileEntry[] = [
    { name: "a.txt", path: "/a.txt", is_dir: false },
    { name: "b.txt", path: "/b.txt", is_dir: false },
  ];

  const setupStore = (
    overrides: Partial<ReturnType<typeof useNavigationStore>>,
  ) => {
    mockedUseNavigationStore.mockReturnValue({
      currentPath: "/",
      setCurrentPath: vi.fn(),
      selectedFiles: new Set(["/a.txt"]),
      lastSelected: "/a.txt",
      selectFile: vi.fn(),
      selectRange: vi.fn(),
      clearSelection: vi.fn(),
      openPreview: vi.fn(),
      copyFiles: vi.fn(),
      cutFiles: vi.fn(),
      clipboard: { files: [], operation: null },
      clearClipboard: vi.fn(),
      setDeleteConfirmOpen: vi.fn(),
      ...overrides,
    } as ReturnType<typeof useNavigationStore>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
    mockedResolveLocalPath.mockReturnValue(null);
    mockedIsMacOS.mockReturnValue(false);
    setupStore({});
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects next entry on ArrowDown", () => {
    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    const store = mockedUseNavigationStore.mock.results[0].value;
    expect(store.selectFile).toHaveBeenCalledWith("/b.txt");
  });

  it("selects previous entry on ArrowUp", () => {
    setupStore({
      selectedFiles: new Set(["/b.txt"]),
      lastSelected: "/b.txt",
    });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));

    const store = mockedUseNavigationStore.mock.results[0].value;
    expect(store.selectFile).toHaveBeenCalledWith("/a.txt");
  });

  it("extends selection range with Shift+ArrowDown", () => {
    const selectRange = vi.fn();
    setupStore({ selectRange });

    renderHook(() =>
      useKeyboard({
        entries: [
          { name: "a.txt", path: "/a.txt", is_dir: false },
          { name: "b.txt", path: "/b.txt", is_dir: false },
          { name: "c.txt", path: "/c.txt", is_dir: false },
        ],
      }),
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }),
    );

    expect(selectRange).toHaveBeenCalledWith(
      expect.arrayContaining(["/a.txt", "/b.txt"]),
    );
  });

  it("selects first and last entries with Home/End", () => {
    const selectFile = vi.fn();
    setupStore({ selectFile });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));

    expect(selectFile).toHaveBeenNthCalledWith(1, "/a.txt");
    expect(selectFile).toHaveBeenNthCalledWith(2, "/b.txt");
  });

  it("opens file on Enter", () => {
    mockedApi.getDownloadUrl.mockReturnValue("/download/a.txt");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    setupStore({
      selectedFiles: new Set(["/a.bin"]),
      lastSelected: "/a.bin",
    });

    renderHook(() =>
      useKeyboard({
        entries: [{ name: "a.bin", path: "/a.bin", is_dir: false }],
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(openSpy).toHaveBeenCalledWith("/download/a.txt", "_blank");
    openSpy.mockRestore();
  });

  it("navigates into directories on Enter", () => {
    const setCurrentPath = vi.fn();
    setupStore({
      setCurrentPath,
      selectedFiles: new Set(["/dir"]),
      lastSelected: "/dir",
    });

    renderHook(() =>
      useKeyboard({
        entries: [{ name: "dir", path: "/dir", is_dir: true }],
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(setCurrentPath).toHaveBeenCalledWith("/dir");
  });

  it("opens Quick Look on Space in macOS Tauri mode", () => {
    mockedIsTauri.mockReturnValue(true);
    mockedIsMacOS.mockReturnValue(true);
    mockedResolveLocalPath.mockReturnValue("/Users/test/a.txt");

    renderHook(() =>
      useKeyboard({
        entries: [{ name: "a.txt", path: "/a.txt", is_dir: false }],
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    expect(mockedQuickLook).toHaveBeenCalledWith("/Users/test/a.txt");
  });

  it("copies selection on Ctrl+C", () => {
    const copyFiles = vi.fn();
    setupStore({ copyFiles });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", ctrlKey: true }),
    );

    expect(copyFiles).toHaveBeenCalledWith(["/a.txt"]);
  });

  it("cuts selection on Cmd+X", () => {
    const cutFiles = vi.fn();
    setupStore({ cutFiles });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", metaKey: true }),
    );

    expect(cutFiles).toHaveBeenCalledWith(["/a.txt"]);
  });

  it("selects all entries on Ctrl+A", () => {
    const selectRange = vi.fn();
    setupStore({ selectRange });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
    );

    expect(selectRange).toHaveBeenCalledWith(["/a.txt", "/b.txt"]);
  });

  it("pastes cut files and clears clipboard", async () => {
    const clearClipboard = vi.fn();
    setupStore({
      currentPath: "/dest",
      clipboard: { files: ["/a.txt"], operation: "cut" },
      clearClipboard,
    });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "v", ctrlKey: true }),
    );

    await waitFor(() => expect(moveMock).toHaveBeenCalled());
    expect(moveMock).toHaveBeenCalledWith({
      from: "/a.txt",
      to: "/dest/a.txt",
    });
    expect(clearClipboard).toHaveBeenCalled();
  });

  it("pastes copied files without clearing clipboard", async () => {
    const clearClipboard = vi.fn();
    setupStore({
      currentPath: "/dest",
      clipboard: { files: ["/a.txt"], operation: "copy" },
      clearClipboard,
    });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "v", ctrlKey: true }),
    );

    await waitFor(() => expect(copyMock).toHaveBeenCalled());
    expect(copyMock).toHaveBeenCalledWith({
      from: "/a.txt",
      to: "/dest/a.txt",
    });
    expect(clearClipboard).not.toHaveBeenCalled();
  });

  it("opens delete confirmation on Delete", () => {
    const setDeleteConfirmOpen = vi.fn();
    setupStore({ setDeleteConfirmOpen });

    renderHook(() => useKeyboard({ entries }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));

    expect(setDeleteConfirmOpen).toHaveBeenCalledWith(true);
  });

  it("renames selection on F2", () => {
    const onRename = vi.fn();

    renderHook(() => useKeyboard({ entries, onRename }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F2" }));

    expect(onRename).toHaveBeenCalledWith("/a.txt");
  });

  it("ignores keydown when input is focused", () => {
    const selectFile = vi.fn();
    setupStore({ selectFile });

    renderHook(() => useKeyboard({ entries }));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );

    expect(selectFile).not.toHaveBeenCalled();
  });
});
