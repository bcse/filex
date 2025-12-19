import React, { useState } from 'react';
import { FolderOpen, Download, Pencil, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { useNavigationStore } from '@/stores/navigation';
import { useDelete, useRename } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import type { FileEntry } from '@/types/file';

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
    selectedFiles,
    clearSelection,
  } = useNavigationStore();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteFile = useDelete();
  const rename = useRename();

  const selectedArray = Array.from(selectedFiles);
  const isSelected = selectedFiles.has(entry.path);
  const targetPaths = isSelected && selectedArray.length > 1 ? selectedArray : [entry.path];
  const canGoToParent = showGoToParent && selectedFiles.size <= 1;

  const handleOpen = () => {
    if (!entry.is_dir) return;
    setCurrentPath(entry.path);
  };

  const handleDownload = () => {
    for (const path of targetPaths) {
      const url = api.getDownloadUrl(path);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'download';
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
    const trimmedPath = entry.path.replace(/\/+$/, '');
    const lastSlash = trimmedPath.lastIndexOf('/');
    const parentPath = trimmedPath === '' || lastSlash <= 0 ? '/' : trimmedPath.slice(0, lastSlash);
    setCurrentPath(parentPath);
  };

  const handleConfirmDelete = async () => {
    for (const path of targetPaths) {
      await deleteFile.mutateAsync(path);
    }
    clearSelection();
    setDeleteOpen(false);
  };

  return (
    <>
      <ContextMenu onOpenChange={(open) => {
        if (open) onSelect();
      }}>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
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
