import { create } from 'zustand';
import type { SortConfig } from '@/types/file';

type ViewMode = 'table' | 'grid';

interface NavigationState {
  // Current path
  currentPath: string;
  setCurrentPath: (path: string, options?: { exitSearch?: boolean }) => void;

  // Selection
  selectedFiles: Set<string>;
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
      isSearching: options.exitSearch ? false : state.isSearching,
      searchQuery: options.exitSearch ? '' : state.searchQuery,
    })),
  
  // Selection
  selectedFiles: new Set(),
  selectFile: (path, multi = false) =>
    set((state) => {
      if (multi) {
        const newSelection = new Set(state.selectedFiles);
        newSelection.add(path);
        return { selectedFiles: newSelection };
      }
      return { selectedFiles: new Set([path]) };
    }),
  selectRange: (paths) =>
    set({ selectedFiles: new Set(paths) }),
  clearSelection: () => set({ selectedFiles: new Set() }),
  toggleSelection: (path) =>
    set((state) => {
      const newSelection = new Set(state.selectedFiles);
      if (newSelection.has(path)) {
        newSelection.delete(path);
      } else {
        newSelection.add(path);
      }
      return { selectedFiles: newSelection };
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
  
  // UI state
  sidebarWidth: 250,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  viewMode: (typeof window !== 'undefined' ? localStorage.getItem('viewMode') as ViewMode : null) || 'table',
  setViewMode: (mode) => {
    localStorage.setItem('viewMode', mode);
    set({ viewMode: mode });
  },
}));
