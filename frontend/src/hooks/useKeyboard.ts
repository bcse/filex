import { useEffect, useCallback } from "react";
import { useNavigationStore } from "@/stores/navigation";
import { useMove, useCopy } from "@/hooks/useDirectory";
import { api } from "@/api/client";
import { toast } from "sonner";
import { isTauri, resolveLocalPath } from "@/lib/config";
import {
  isMacOS,
  openLocalPath,
  quickLook,
  quickLookRefresh,
  quickLookIsVisible,
} from "@/lib/tauri";
import { isPreviewableFile } from "@/lib/filePreview";
import type { FileEntry } from "@/types/file";

interface UseKeyboardOptions {
  entries: FileEntry[];
  onRename?: (path: string) => void;
}

export function useKeyboard({ entries, onRename }: UseKeyboardOptions) {
  const {
    currentPath,
    setCurrentPath,
    selectedFiles,
    lastSelected,
    selectFile,
    selectRange,
    clearSelection,
    openPreview,
    copyFiles,
    cutFiles,
    clipboard,
    clearClipboard,
    setDeleteConfirmOpen,
  } = useNavigationStore();

  const move = useMove();
  const copy = useCopy();

  // Get the focused index based on selection
  const getFocusedIndex = useCallback(() => {
    if (selectedFiles.size === 0) return -1;
    const anchor = lastSelected || Array.from(selectedFiles).pop();
    if (!anchor) return -1;
    return entries.findIndex((e) => e.path === anchor);
  }, [selectedFiles, entries, lastSelected]);

  // Handle QuickLook navigation event from native side (single-item mode only)
  const handleQuickLookNavigate = useCallback(
    (direction: number) => {
      // Only handle navigation when a single item is selected
      // Multi-item navigation is handled natively in Quick Look panel
      if (selectedFiles.size !== 1) {
        return;
      }

      const focusedIndex = getFocusedIndex();
      let newIndex: number;

      if (direction < 0) {
        // Up arrow
        newIndex = Math.max(focusedIndex - 1, 0);
      } else {
        // Down arrow
        newIndex = Math.min(focusedIndex + 1, entries.length - 1);
      }

      if (newIndex >= 0 && entries[newIndex]) {
        const entry = entries[newIndex];
        selectFile(entry.path);

        // Refresh QuickLook with new item
        const localPath = resolveLocalPath(entry.path);
        if (localPath) {
          void quickLookRefresh([localPath]);
        }
      }
    },
    [entries, getFocusedIndex, selectFile, selectedFiles.size],
  );

  // Listen for QuickLook navigation events from Tauri
  useEffect(() => {
    if (!isTauri() || !isMacOS()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<number>("quick-look-navigate", (event) => {
          handleQuickLookNavigate(event.payload);
        });
      } catch {
        // Ignore errors if Tauri is not available
      }
    };

    void setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleQuickLookNavigate]);

  // Update QuickLook when selection changes (e.g., via mouse click)
  useEffect(() => {
    if (!isTauri() || !isMacOS()) {
      return;
    }

    const updateQuickLookIfVisible = async () => {
      const isVisible = await quickLookIsVisible();
      if (!isVisible) {
        return;
      }

      // Get all selected entries and resolve their local paths
      const selectedPaths = Array.from(selectedFiles);
      if (selectedPaths.length === 0) {
        return;
      }

      const localPaths = selectedPaths
        .map((path) => resolveLocalPath(path))
        .filter((path): path is string => path !== null);

      if (localPaths.length > 0) {
        void quickLookRefresh(localPaths);
      }
    };

    void updateQuickLookIfVisible();
  }, [lastSelected, selectedFiles, entries]);

  const handlePaste = useCallback(async () => {
    if (clipboard.files.length === 0) return;

    for (const filePath of clipboard.files) {
      const fileName = filePath.split("/").pop() || "";
      const targetPath =
        currentPath === "/" ? `/${fileName}` : `${currentPath}/${fileName}`;

      if (clipboard.operation === "cut") {
        await move.mutateAsync({ from: filePath, to: targetPath });
      }
      if (clipboard.operation === "copy") {
        await copy.mutateAsync({ from: filePath, to: targetPath });
      }
    }

    if (clipboard.operation === "cut") {
      clearClipboard();
    }
  }, [clipboard, clearClipboard, copy, currentPath, move]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex = Math.min(focusedIndex + 1, entries.length - 1);
          if (nextIndex >= 0 && entries[nextIndex]) {
            if (e.shiftKey && focusedIndex >= 0) {
              // Range selection
              const start = Math.min(focusedIndex, nextIndex);
              const end = Math.max(focusedIndex, nextIndex);
              const rangePaths = entries
                .slice(start, end + 1)
                .map((e) => e.path);
              selectRange([...Array.from(selectedFiles), ...rangePaths]);
            } else {
              selectFile(entries[nextIndex].path);
            }
          }
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          const prevIndex = Math.max(focusedIndex - 1, 0);
          if (entries[prevIndex]) {
            if (e.shiftKey && focusedIndex >= 0) {
              // Range selection
              const start = Math.min(focusedIndex, prevIndex);
              const end = Math.max(focusedIndex, prevIndex);
              const rangePaths = entries
                .slice(start, end + 1)
                .map((e) => e.path);
              selectRange([...Array.from(selectedFiles), ...rangePaths]);
            } else {
              selectFile(entries[prevIndex].path);
            }
          }
          break;
        }

        case "Home": {
          e.preventDefault();
          if (entries.length > 0) {
            selectFile(entries[0].path);
          }
          break;
        }

        case "End": {
          e.preventDefault();
          if (entries.length > 0) {
            selectFile(entries[entries.length - 1].path);
          }
          break;
        }

        case "Enter": {
          e.preventDefault();
          if (focusedIndex >= 0 && entries[focusedIndex]) {
            const entry = entries[focusedIndex];
            if (entry.is_dir) {
              setCurrentPath(entry.path);
            } else {
              const localPath = resolveLocalPath(entry.path);
              if (localPath) {
                void openLocalPath(
                  localPath,
                  api.getDownloadUrl(entry.path),
                  { suppressMissingToast: isPreviewableFile(entry) },
                ).then((result) => {
                  if (
                    !result.opened &&
                    (result.reason !== "missing" ||
                      isPreviewableFile(entry)) &&
                    isPreviewableFile(entry)
                  ) {
                    openPreview(entry);
                  }
                });
              } else if (isPreviewableFile(entry)) {
                openPreview(entry);
              } else if (!isTauri()) {
                window.open(api.getDownloadUrl(entry.path), "_blank");
              } else {
                toast.error(
                  "Unable to open file. Add a path mapping in Settings to enable local opening.",
                );
              }
            }
          }
          break;
        }

        case " ":
        case "Spacebar": {
          if (!isTauri() || !isMacOS()) {
            break;
          }

          // Get all selected items (files and folders)
          const selectedPaths = Array.from(selectedFiles);
          if (
            selectedPaths.length === 0 &&
            focusedIndex >= 0 &&
            entries[focusedIndex]
          ) {
            // No selection, use focused item
            selectedPaths.push(entries[focusedIndex].path);
          }

          if (selectedPaths.length > 0) {
            const localPaths = selectedPaths
              .map((path) => resolveLocalPath(path))
              .filter((path): path is string => path !== null);

            if (localPaths.length > 0) {
              e.preventDefault();
              void quickLook(localPaths);
            }
          }
          break;
        }

        case "Backspace":
        case "Delete": {
          if (selectedFiles.size > 0) {
            e.preventDefault();
            setDeleteConfirmOpen(true);
          }
          break;
        }

        case "F2": {
          if (selectedFiles.size === 1 && onRename) {
            e.preventDefault();
            const path = Array.from(selectedFiles)[0];
            onRename(path);
          }
          break;
        }

        case "a":
        case "A": {
          if (isCtrlOrCmd) {
            e.preventDefault();
            selectRange(entries.map((e) => e.path));
          }
          break;
        }

        case "c":
        case "C": {
          if (isCtrlOrCmd && selectedFiles.size > 0) {
            e.preventDefault();
            copyFiles(Array.from(selectedFiles));
          }
          break;
        }

        case "x":
        case "X": {
          if (isCtrlOrCmd && selectedFiles.size > 0) {
            e.preventDefault();
            cutFiles(Array.from(selectedFiles));
          }
          break;
        }

        case "v":
        case "V": {
          if (isCtrlOrCmd && clipboard.files.length > 0) {
            e.preventDefault();
            void handlePaste();
          }
          break;
        }

        case "Escape": {
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
      setDeleteConfirmOpen,
      handlePaste,
      onRename,
      openPreview,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
