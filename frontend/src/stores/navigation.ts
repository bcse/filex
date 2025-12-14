import { create } from 'zustand';
import type { SortConfig } from '@/types/file';

type ViewMode = 'table' | 'grid';

interface NavigationState {
  // Current path
  currentPath: string;
  setCurrentPath: (path: string, options?: { exitSearch?: boolean }) => void;

  // Selection
  selectedFiles: Set<string>;
  lastSelected: string | null;
  selectFile: (path: string, multi?: boolean) => void;
  selectRange: (paths: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (path: string) => void;

  // Sort
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearching: boolean;
  setIsSearching: (searching: boolean) => void;

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
      selectedFiles: new Set(),
      lastSelected: null,
      isSearching: options.exitSearch ? false : state.isSearching,
      searchQuery: options.exitSearch ? '' : state.searchQuery,
    })),
  
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
  
  // Sort
  sortConfig: { field: 'name', order: 'asc' },
  setSortConfig: (config) => set({ sortConfig: config }),
  
  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  isSearching: false,
  setIsSearching: (searching) => set({ isSearching: searching }),
  
  // Clipboard
  clipboard: { files: [], operation: null },
  copyFiles: (paths) => set({ clipboard: { files: paths, operation: 'copy' } }),
  cutFiles: (paths) => set({ clipboard: { files: paths, operation: 'cut' } }),
  clearClipboard: () => set({ clipboard: { files: [], operation: null } }),

  // Delete confirmation
  deleteConfirmOpen: false,
  setDeleteConfirmOpen: (open) => set({ deleteConfirmOpen: open }),

  // UI state
  sidebarWidth: 250,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  viewMode: (typeof window !== 'undefined' ? localStorage.getItem('viewMode') as ViewMode : null) || 'table',
  setViewMode: (mode) => {
    localStorage.setItem('viewMode', mode);
    set({ viewMode: mode });
  },
}));
