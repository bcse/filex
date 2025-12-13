import { create } from 'zustand';

interface PreviewState {
  // Whether the preview panel is visible
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;

  // Preview panel width
  previewWidth: number;
  setPreviewWidth: (width: number) => void;
}

export const usePreviewStore = create<PreviewState>((set) => {
  // Initialize from localStorage
  const savedWidth = typeof window !== 'undefined'
    ? parseInt(localStorage.getItem('previewWidth') || '350', 10)
    : 350;
  const savedIsOpen = typeof window !== 'undefined'
    ? localStorage.getItem('previewOpen') === 'true'
    : false;

  return {
    isOpen: savedIsOpen,
    setIsOpen: (open) => {
      localStorage.setItem('previewOpen', String(open));
      set({ isOpen: open });
    },
    toggle: () =>
      set((state) => {
        const newOpen = !state.isOpen;
        localStorage.setItem('previewOpen', String(newOpen));
        return { isOpen: newOpen };
      }),

    previewWidth: savedWidth,
    setPreviewWidth: (width) => {
      localStorage.setItem('previewWidth', String(width));
      set({ previewWidth: width });
    },
  };
});
