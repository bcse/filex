import { useEffect, useCallback } from 'react';
import { useNavigationStore } from '@/stores/navigation';
import { useDelete, useMove, useCopy } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import type { FileEntry } from '@/types/file';

interface UseKeyboardOptions {
  entries: FileEntry[];
  onRename?: (path: string) => void;
}

export function useKeyboard({ entries, onRename }: UseKeyboardOptions) {
  const {
    currentPath,
    setCurrentPath,
    selectedFiles,
    selectFile,
    selectRange,
    clearSelection,
    copyFiles,
    cutFiles,
    clipboard,
    clearClipboard,
  } = useNavigationStore();

  const deleteFile = useDelete();
  const move = useMove();
  const copy = useCopy();

  // Get the focused index based on selection
  const getFocusedIndex = useCallback(() => {
    if (selectedFiles.size === 0) return -1;
    const lastSelected = Array.from(selectedFiles).pop();
    return entries.findIndex((e) => e.path === lastSelected);
  }, [selectedFiles, entries]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      // Don't handle if input is focused
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const focusedIndex = getFocusedIndex();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = Math.min(focusedIndex + 1, entries.length - 1);
          if (nextIndex >= 0 && entries[nextIndex]) {
            if (e.shiftKey && focusedIndex >= 0) {
              // Range selection
              const start = Math.min(focusedIndex, nextIndex);
              const end = Math.max(focusedIndex, nextIndex);
              const rangePaths = entries.slice(start, end + 1).map((e) => e.path);
              selectRange([...Array.from(selectedFiles), ...rangePaths]);
            } else {
              selectFile(entries[nextIndex].path);
            }
          }
          break;
        }

        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = Math.max(focusedIndex - 1, 0);
          if (entries[prevIndex]) {
            if (e.shiftKey && focusedIndex >= 0) {
              // Range selection
              const start = Math.min(focusedIndex, prevIndex);
              const end = Math.max(focusedIndex, prevIndex);
              const rangePaths = entries.slice(start, end + 1).map((e) => e.path);
              selectRange([...Array.from(selectedFiles), ...rangePaths]);
            } else {
              selectFile(entries[prevIndex].path);
            }
          }
          break;
        }

        case 'Home': {
          e.preventDefault();
          if (entries.length > 0) {
            selectFile(entries[0].path);
          }
          break;
        }

        case 'End': {
          e.preventDefault();
          if (entries.length > 0) {
            selectFile(entries[entries.length - 1].path);
          }
          break;
        }

        case 'Enter': {
          e.preventDefault();
          if (focusedIndex >= 0 && entries[focusedIndex]) {
            const entry = entries[focusedIndex];
            if (entry.is_dir) {
              setCurrentPath(entry.path);
            } else {
              window.open(api.getDownloadUrl(entry.path), '_blank');
            }
          }
          break;
        }

        case 'Backspace':
        case 'Delete': {
          if (selectedFiles.size > 0) {
            e.preventDefault();
            const paths = Array.from(selectedFiles);
            for (const path of paths) {
              await deleteFile.mutateAsync(path);
            }
            clearSelection();
          }
          break;
        }

        case 'F2': {
          if (selectedFiles.size === 1 && onRename) {
            e.preventDefault();
            const path = Array.from(selectedFiles)[0];
            onRename(path);
          }
          break;
        }

        case 'a':
        case 'A': {
          if (isCtrlOrCmd) {
            e.preventDefault();
            selectRange(entries.map((e) => e.path));
          }
          break;
        }

        case 'c':
        case 'C': {
          if (isCtrlOrCmd && selectedFiles.size > 0) {
            e.preventDefault();
            copyFiles(Array.from(selectedFiles));
          }
          break;
        }

        case 'x':
        case 'X': {
          if (isCtrlOrCmd && selectedFiles.size > 0) {
            e.preventDefault();
            cutFiles(Array.from(selectedFiles));
          }
          break;
        }

        case 'v':
        case 'V': {
          if (isCtrlOrCmd && clipboard.files.length > 0) {
            e.preventDefault();
            for (const filePath of clipboard.files) {
              const fileName = filePath.split('/').pop() || '';
              const targetPath =
                currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

              if (clipboard.operation === 'cut') {
                await move.mutateAsync({ from: filePath, to: targetPath });
              }
              if (clipboard.operation === 'copy') {
                await copy.mutateAsync({ from: filePath, to: targetPath });
              }
            }
            if (clipboard.operation === 'cut') {
              clearClipboard();
            }
          }
          break;
        }

        case 'Escape': {
          clearSelection();
          break;
        }
      }
    },
    [
      entries,
      getFocusedIndex,
      selectedFiles,
      selectFile,
      selectRange,
      clearSelection,
      setCurrentPath,
      copyFiles,
      cutFiles,
      clipboard,
      clearClipboard,
      currentPath,
      deleteFile,
      move,
      copy,
      onRename,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
