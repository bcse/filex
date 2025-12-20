import { create } from "zustand";
import type { FileEntry, SortConfig } from "@/types/file";
import { DEFAULT_PAGE_SIZE } from "@/config/pagination";

type ViewMode = "table" | "grid";

type HistoryEntry =
  | { type: "path"; path: string; offset: number }
  | {
      type: "search";
      path: string;
      pathOffset: number;
      query: string;
      offset: number;
    };

type HistoryUpdateOptions = {
  replace?: boolean;
};

type HistoryRecordOptions = {
  recordHistory?: boolean;
  replaceHistory?: boolean;
};

interface NavigationState {
  // Current path
  currentPath: string;
  setCurrentPath: (
    path: string,
    options?: { exitSearch?: boolean; recordHistory?: boolean },
  ) => void;
  directoryOffset: number;
  directoryLimit: number;
  setDirectoryOffset: (offset: number, options?: HistoryRecordOptions) => void;
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;

  // Selection
  selectedFiles: Set<string>;
  lastSelected: string | null;
  selectFile: (path: string, multi?: boolean) => void;
  selectRange: (paths: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (path: string) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string, options?: HistoryRecordOptions) => void;
  isSearching: boolean;
  setIsSearching: (searching: boolean) => void;
  searchOffset: number;
  searchLimit: number;
  setSearchOffset: (offset: number, options?: HistoryRecordOptions) => void;
  searchSortConfig: SortConfig;
  setSearchSortConfig: (config: SortConfig) => void;

  // Clipboard (for copy/cut)
  clipboard: {
    files: string[];
    operation: "copy" | "cut" | null;
  };
  copyFiles: (paths: string[]) => void;
  cutFiles: (paths: string[]) => void;
  clearClipboard: () => void;

  // Delete confirmation
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;

  // Focus
  pendingFocusPath: string | null;
  setPendingFocusPath: (path: string | null) => void;

  // UI state
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Preview
  previewEntry: FileEntry | null;
  openPreview: (entry: FileEntry) => void;
  closePreview: () => void;

  // History
  history: HistoryEntry[];
  historyIndex: number;
  goBack: () => void;
  goForward: () => void;
}

const isSameEntry = (
  a: HistoryEntry | undefined,
  b: HistoryEntry | undefined,
) => {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "path" && b.type === "path") {
    return a.path === b.path && a.offset === b.offset;
  }
  if (a.type === "search" && b.type === "search") {
    return (
      a.path === b.path &&
      a.pathOffset === b.pathOffset &&
      a.query === b.query &&
      a.offset === b.offset
    );
  }
  return false;
};

const applyHistoryEntry = (entry: HistoryEntry) => {
  if (entry.type === "path") {
    return {
      currentPath: entry.path,
      directoryOffset: entry.offset,
      selectedFiles: new Set<string>(),
      lastSelected: null,
      isSearching: false,
      searchQuery: "",
      searchOffset: 0,
    };
  }
  return {
    currentPath: entry.path,
    directoryOffset: entry.pathOffset,
    selectedFiles: new Set<string>(),
    lastSelected: null,
    isSearching: true,
    searchQuery: entry.query,
    searchOffset: entry.offset,
  };
};

const commitHistory = (
  state: NavigationState,
  entry: HistoryEntry,
  options: HistoryUpdateOptions = {},
) => {
  const nextHistory = state.history.slice(0, state.historyIndex + 1);
  if (options.replace && nextHistory.length) {
    nextHistory[nextHistory.length - 1] = entry;
  } else {
    nextHistory.push(entry);
  }
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
};

export const useNavigationStore = create<NavigationState>((set) => ({
  // Current path
  currentPath: "/",
  setCurrentPath: (path, options = { exitSearch: true, recordHistory: true }) =>
    set((state) => {
      const recordHistory = options.recordHistory ?? true;
      const exitSearch = options.exitSearch ?? true;
      const nextState = {
        currentPath: path,
        directoryOffset: 0,
        selectedFiles: new Set<string>(),
        lastSelected: null,
        isSearching: exitSearch ? false : state.isSearching,
        searchQuery: exitSearch ? "" : state.searchQuery,
        searchOffset: exitSearch ? 0 : state.searchOffset,
      };
      if (!recordHistory) {
        return nextState;
      }
      const entry: HistoryEntry = { type: "path", path, offset: 0 };
      if (isSameEntry(entry, state.history[state.historyIndex])) {
        return nextState;
      }
      return { ...nextState, ...commitHistory(state, entry) };
    }),
  directoryOffset: 0,
  directoryLimit: DEFAULT_PAGE_SIZE,
  setDirectoryOffset: (offset, options = {}) =>
    set((state) => {
      const recordHistory = options.recordHistory ?? true;
      const nextOffset = Math.max(0, offset);
      const nextState = { directoryOffset: nextOffset };
      if (!recordHistory) {
        return nextState;
      }
      const entry: HistoryEntry = {
        type: "path",
        path: state.currentPath,
        offset: nextOffset,
      };
      if (isSameEntry(entry, state.history[state.historyIndex])) {
        return nextState;
      }
      return {
        ...nextState,
        ...commitHistory(state, entry, { replace: options.replaceHistory }),
      };
    }),
  sortConfig: { field: "name", order: "asc" },
  setSortConfig: (config) => set({ sortConfig: config }),

  // Selection
  selectedFiles: new Set(),
  lastSelected: null,
  selectFile: (path, multi = false) =>
    set((state) => {
      if (multi) {
        const newSelection = new Set(state.selectedFiles);
        newSelection.add(path);
        return { selectedFiles: newSelection, lastSelected: path };
      }
      return { selectedFiles: new Set([path]), lastSelected: path };
    }),
  selectRange: (paths) =>
    set(() => {
      const uniquePaths = Array.from(new Set(paths));
      const last = paths.length ? paths[paths.length - 1] : null;
      return {
        selectedFiles: new Set(uniquePaths),
        lastSelected: last,
      };
    }),
  clearSelection: () => set({ selectedFiles: new Set(), lastSelected: null }),
  toggleSelection: (path) =>
    set((state) => {
      const newSelection = new Set(state.selectedFiles);
      let nextLastSelected = state.lastSelected;
      if (newSelection.has(path)) {
        newSelection.delete(path);
        if (state.lastSelected === path) {
          nextLastSelected = newSelection.size
            ? Array.from(newSelection).pop() || null
            : null;
        }
      } else {
        newSelection.add(path);
        nextLastSelected = path;
      }
      return { selectedFiles: newSelection, lastSelected: nextLastSelected };
    }),

  // Search
  searchQuery: "",
  setSearchQuery: (query, options = {}) =>
    set((state) => {
      const recordHistory = options.recordHistory ?? true;
      const nextState = { searchQuery: query };
      if (!recordHistory || query.length < 2) {
        return nextState;
      }
      const entry: HistoryEntry = {
        type: "search",
        query,
        offset: state.searchOffset,
        path: state.currentPath,
        pathOffset: state.directoryOffset,
      };
      const lastEntry = state.history[state.historyIndex];
      const replace = lastEntry?.type === "search";
      if (isSameEntry(entry, lastEntry)) {
        return nextState;
      }
      return { ...nextState, ...commitHistory(state, entry, { replace }) };
    }),
  isSearching: false,
  setIsSearching: (searching) => set({ isSearching: searching }),
  searchOffset: 0,
  searchLimit: DEFAULT_PAGE_SIZE,
  setSearchOffset: (offset, options = {}) =>
    set((state) => {
      const recordHistory = options.recordHistory ?? true;
      const nextOffset = Math.max(0, offset);
      const nextState = { searchOffset: nextOffset };
      if (
        !recordHistory ||
        state.searchQuery.length < 2 ||
        !state.isSearching
      ) {
        return nextState;
      }
      const entry: HistoryEntry = {
        type: "search",
        query: state.searchQuery,
        offset: nextOffset,
        path: state.currentPath,
        pathOffset: state.directoryOffset,
      };
      if (isSameEntry(entry, state.history[state.historyIndex])) {
        return nextState;
      }
      return {
        ...nextState,
        ...commitHistory(state, entry, { replace: options.replaceHistory }),
      };
    }),
  searchSortConfig: { field: "name", order: "asc" },
  setSearchSortConfig: (config) => set({ searchSortConfig: config }),

  // Clipboard
  clipboard: { files: [], operation: null },
  copyFiles: (paths) => set({ clipboard: { files: paths, operation: "copy" } }),
  cutFiles: (paths) => set({ clipboard: { files: paths, operation: "cut" } }),
  clearClipboard: () => set({ clipboard: { files: [], operation: null } }),

  // Delete confirmation
  deleteConfirmOpen: false,
  setDeleteConfirmOpen: (open) => set({ deleteConfirmOpen: open }),

  // Focus
  pendingFocusPath: null,
  setPendingFocusPath: (path) => set({ pendingFocusPath: path }),

  // UI state
  sidebarWidth: 250,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  viewMode:
    (typeof window !== "undefined"
      ? (localStorage.getItem("viewMode") as ViewMode)
      : null) || "table",
  setViewMode: (mode) => {
    localStorage.setItem("viewMode", mode);
    set({ viewMode: mode });
  },

  // Preview
  previewEntry: null,
  openPreview: (entry) => set({ previewEntry: entry }),
  closePreview: () => set({ previewEntry: null }),

  // History
  history: [{ type: "path", path: "/", offset: 0 }],
  historyIndex: 0,
  goBack: () =>
    set((state) => {
      if (state.historyIndex <= 0) return {};
      const nextIndex = state.historyIndex - 1;
      const entry = state.history[nextIndex];
      return { ...applyHistoryEntry(entry), historyIndex: nextIndex };
    }),
  goForward: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return {};
      const nextIndex = state.historyIndex + 1;
      const entry = state.history[nextIndex];
      return { ...applyHistoryEntry(entry), historyIndex: nextIndex };
    }),
}));
