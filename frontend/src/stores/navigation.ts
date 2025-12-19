import { create } from 'zustand';
import type { SortConfig } from '@/types/file';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

type ViewMode = 'table' | 'grid';

interface NavigationState {
  // Current path
  currentPath: string;
  setCurrentPath: (path: string, options?: { exitSearch?: boolean }) => void;
  directoryOffset: number;
  directoryLimit: number;
  setDirectoryOffset: (offset: number) => void;
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
  setSearchQuery: (query: string) => void;
  isSearching: boolean;
  setIsSearching: (searching: boolean) => void;
  searchOffset: number;
  searchLimit: number;
  setSearchOffset: (offset: number) => void;
  searchSortConfig: SortConfig;
  setSearchSortConfig: (config: SortConfig) => void;

  // Clipboard (for copy/cut)
  clipboard: {
    files: string[];
    operation: 'copy' | 'cut' | null;
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
}

export const useNavigationStore = create<NavigationState>((set) => ({
  // Current path
  currentPath: '/',
  setCurrentPath: (path, options = { exitSearch: true }) =>
    set((state) => ({
      currentPath: path,
      directoryOffset: 0,
      selectedFiles: new Set(),
      lastSelected: null,
      isSearching: options.exitSearch ? false : state.isSearching,
      searchQuery: options.exitSearch ? '' : state.searchQuery,
      searchOffset: options.exitSearch ? 0 : state.searchOffset,
    })),
  directoryOffset: 0,
  directoryLimit: DEFAULT_PAGE_SIZE,
  setDirectoryOffset: (offset) => set({ directoryOffset: Math.max(0, offset) }),
  sortConfig: { field: 'name', order: 'asc' },
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
          nextLastSelected = newSelection.size ? Array.from(newSelection).pop() || null : null;
        }
      } else {
        newSelection.add(path);
        nextLastSelected = path;
      }
      return { selectedFiles: newSelection, lastSelected: nextLastSelected };
    }),
  
  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  isSearching: false,
  setIsSearching: (searching) => set({ isSearching: searching }),
  searchOffset: 0,
  searchLimit: DEFAULT_PAGE_SIZE,
  setSearchOffset: (offset) => set({ searchOffset: Math.max(0, offset) }),
  searchSortConfig: { field: 'name', order: 'asc' },
  setSearchSortConfig: (config) => set({ searchSortConfig: config }),
  
  // Clipboard
  clipboard: { files: [], operation: null },
  copyFiles: (paths) => set({ clipboard: { files: paths, operation: 'copy' } }),
  cutFiles: (paths) => set({ clipboard: { files: paths, operation: 'cut' } }),
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
  viewMode: (typeof window !== 'undefined' ? localStorage.getItem('viewMode') as ViewMode : null) || 'table',
  setViewMode: (mode) => {
    localStorage.setItem('viewMode', mode);
    set({ viewMode: mode });
  },
}));
