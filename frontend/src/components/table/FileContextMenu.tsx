import React, { useState } from "react";
import { FolderOpen, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { RenameDialog } from "@/components/dialogs/RenameDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { useNavigationStore } from "@/stores/navigation";
import { useDelete, useRename } from "@/hooks/useDirectory";
import { api } from "@/api/client";
import { DEFAULT_PAGE_SIZE_FALLBACK } from "@/config/pagination";
import { getParentPath } from "@/lib/utils";
import type { FileEntry } from "@/types/file";

interface FileContextMenuProps {
  entry: FileEntry;
  children: React.ReactNode;
  onSelect: () => void;
  showGoToParent?: boolean;
}

export function FileContextMenu({
  entry,
  children,
  onSelect,
  showGoToParent = false,
}: FileContextMenuProps) {
  const {
    setCurrentPath,
    setDirectoryOffset,
    selectedFiles,
    clearSelection,
    sortConfig,
    directoryLimit,
    setPendingFocusPath,
    selectFile,
  } = useNavigationStore();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteFile = useDelete();
  const rename = useRename();

  const selectedArray = Array.from(selectedFiles);
  const isSelected = selectedFiles.has(entry.path);
  const targetPaths =
    isSelected && selectedArray.length > 1 ? selectedArray : [entry.path];
  const canGoToParent = showGoToParent && selectedFiles.size <= 1;

  const handleOpen = () => {
    if (!entry.is_dir) return;
    setCurrentPath(entry.path);
  };

  const handleDownload = () => {
    for (const path of targetPaths) {
      const url = api.getDownloadUrl(path);
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleRename = () => {
    setRenameValue(entry.name);
    setRenameOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renameValue.trim()) return;
    await rename.mutateAsync({ path: entry.path, newName: renameValue.trim() });
    clearSelection();
    setRenameOpen(false);
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const handleGoToParent = () => {
    const mapSortField = (field: typeof sortConfig.field) => {
      switch (field) {
        case "mime_type":
          return "type";
        case "width":
        case "height":
          return "dimensions";
        default:
          return field;
      }
    };

    const parentPath = getParentPath(entry.path);
    const pageSize = directoryLimit || DEFAULT_PAGE_SIZE_FALLBACK;
    const batchSize = Math.max(pageSize, DEFAULT_PAGE_SIZE_FALLBACK);

    const resolveOffset = async () => {
      let offset = 0;
      let total = Infinity;

      while (offset < total) {
        const resp = await api.listDirectory(parentPath, {
          offset,
          limit: batchSize,
          sort_by: mapSortField(sortConfig.field),
          sort_order: sortConfig.order,
        });

        total = resp.total;
        const index = resp.entries.findIndex(
          (item) => item.path === entry.path,
        );
        if (index !== -1) {
          const absoluteIndex = offset + index;
          return Math.floor(absoluteIndex / pageSize) * pageSize;
        }

        if (resp.entries.length === 0) break;
        offset += resp.entries.length;
      }

      return 0;
    };

    setCurrentPath(parentPath);
    setPendingFocusPath(entry.path);
    selectFile(entry.path);

    resolveOffset()
      .then((nextOffset) => {
        setDirectoryOffset(nextOffset, { replaceHistory: true });
      })
      .catch(() => {
        setDirectoryOffset(0, { replaceHistory: true });
      });
  };

  const handleConfirmDelete = async () => {
    const shouldSummarize = targetPaths.length > 1;
    let successCount = 0;
    let errorCount = 0;

    for (const path of targetPaths) {
      try {
        await deleteFile.mutateAsync(
          shouldSummarize ? { path, suppressToast: true } : path,
        );
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (shouldSummarize) {
      if (successCount > 0 && errorCount === 0) {
        toast.success(
          `Deleted ${successCount} item${successCount > 1 ? "s" : ""}`,
        );
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(
          `Deleted ${successCount} item${successCount > 1 ? "s" : ""}, ${errorCount} failed`,
        );
      } else if (errorCount > 0) {
        toast.error(
          `Failed to delete ${errorCount} item${errorCount > 1 ? "s" : ""}`,
        );
      }
    }
    clearSelection();
    setDeleteOpen(false);
  };

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) onSelect();
        }}
      >
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {entry.is_dir && (
            <ContextMenuItem onClick={handleOpen}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Open
              <ContextMenuShortcut>Enter</ContextMenuShortcut>
            </ContextMenuItem>
          )}

          {canGoToParent && (
            <ContextMenuItem onClick={handleGoToParent}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Go to parent folder
            </ContextMenuItem>
          )}

          {!entry.is_dir && (
            <ContextMenuItem onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem onClick={handleRename}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuItem
            onClick={handleDelete}
            className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:text-red-500 dark:focus:text-red-500 dark:focus:bg-red-950"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onConfirm={handleConfirmRename}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleConfirmDelete}
        itemCount={targetPaths.length}
      />
    </>
  );
}
