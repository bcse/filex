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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigationStore } from '@/stores/navigation';
import { useDelete, useRename } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import type { FileEntry } from '@/types/file';

interface FileContextMenuProps {
  entry: FileEntry;
  children: React.ReactNode;
  onSelect: () => void;
}

export function FileContextMenu({ entry, children, onSelect }: FileContextMenuProps) {
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

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Enter a new name.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="New name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {targetPaths.length} item{targetPaths.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected item{targetPaths.length > 1 ? 's' : ''} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
