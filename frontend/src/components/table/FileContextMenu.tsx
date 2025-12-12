import React, { useState } from 'react';
import {
  FolderOpen,
  Download,
  Copy,
  Scissors,
  Clipboard,
  Pencil,
  Trash2,
} from 'lucide-react';
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
import { useDelete, useRename, useMove } from '@/hooks/useDirectory';
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
    copyFiles,
    cutFiles,
    clipboard,
    clearClipboard,
    clearSelection,
  } = useNavigationStore();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteFile = useDelete();
  const rename = useRename();
  const move = useMove();

  const selectedArray = Array.from(selectedFiles);
  const isSelected = selectedFiles.has(entry.path);
  const targetPaths = isSelected && selectedArray.length > 1 ? selectedArray : [entry.path];

  const handleOpen = () => {
    if (entry.is_dir) {
      setCurrentPath(entry.path);
    } else {
      window.open(api.getDownloadUrl(entry.path), '_blank');
    }
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

  const handleCopy = () => {
    copyFiles(targetPaths);
  };

  const handleCut = () => {
    cutFiles(targetPaths);
  };

  const handlePaste = async () => {
    if (!clipboard.files.length || !entry.is_dir) return;

    for (const filePath of clipboard.files) {
      const fileName = filePath.split('/').pop() || '';
      const targetPath = entry.path === '/' ? `/${fileName}` : `${entry.path}/${fileName}`;

      if (clipboard.operation === 'copy') {
        // TODO: Implement copy endpoint
        console.log('Copy not yet implemented:', filePath, '->', targetPath);
      } else if (clipboard.operation === 'cut') {
        await move.mutateAsync({ from: filePath, to: targetPath });
      }
    }

    if (clipboard.operation === 'cut') {
      clearClipboard();
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
          <ContextMenuItem onClick={handleOpen}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {entry.is_dir ? 'Open' : 'Open File'}
            <ContextMenuShortcut>Enter</ContextMenuShortcut>
          </ContextMenuItem>

          {!entry.is_dir && (
            <ContextMenuItem onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuItem onClick={handleCut}>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>⌘X</ContextMenuShortcut>
          </ContextMenuItem>

          {entry.is_dir && clipboard.files.length > 0 && (
            <ContextMenuItem onClick={handlePaste}>
              <Clipboard className="mr-2 h-4 w-4" />
              Paste
              <ContextMenuShortcut>⌘V</ContextMenuShortcut>
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
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
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
