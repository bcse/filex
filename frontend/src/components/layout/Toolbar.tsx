import React, { useState, useRef } from 'react';
import {
  FolderPlus,
  Trash2,
  Download,
  Upload,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useNavigationStore } from '@/stores/navigation';
import { useCreateDirectory, useDelete, useRename, useUpload } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

export function Toolbar() {
  const queryClient = useQueryClient();
  const { currentPath, selectedFiles, clearSelection } = useNavigationStore();

  // Dialog states
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // File input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createDir = useCreateDirectory();
  const deleteFile = useDelete();
  const rename = useRename();
  const upload = useUpload();

  const selectedArray = Array.from(selectedFiles);
  const hasSelection = selectedArray.length > 0;
  const singleSelection = selectedArray.length === 1;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['directory', currentPath] });
    queryClient.invalidateQueries({ queryKey: ['tree'] });
  };

  // New Folder
  const handleNewFolder = () => {
    setNewFolderName('New Folder');
    setNewFolderOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const path = currentPath === '/'
      ? `/${newFolderName.trim()}`
      : `${currentPath}/${newFolderName.trim()}`;
    await createDir.mutateAsync(path);
    setNewFolderOpen(false);
    setNewFolderName('');
  };

  // Delete
  const handleDelete = () => {
    if (!hasSelection) return;
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    for (const path of selectedArray) {
      await deleteFile.mutateAsync(path);
    }
    clearSelection();
    setDeleteOpen(false);
  };

  // Rename
  const handleRename = () => {
    if (!singleSelection) return;
    const path = selectedArray[0];
    const name = path.split('/').pop() || '';
    setRenameValue(name);
    setRenameOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renameValue.trim() || !singleSelection) return;
    const path = selectedArray[0];
    await rename.mutateAsync({ path, newName: renameValue.trim() });
    clearSelection();
    setRenameOpen(false);
    setRenameValue('');
  };

  // Download
  const handleDownload = () => {
    for (const path of selectedArray) {
      const url = api.getDownloadUrl(path);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Upload
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await upload.mutateAsync({ targetPath: currentPath, files });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isLoading = createDir.isPending || deleteFile.isPending || rename.isPending || upload.isPending;

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleNewFolder}
          disabled={isLoading}
        >
          <FolderPlus className="w-4 h-4 mr-1" />
          New Folder
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleUploadClick}
          disabled={isLoading}
        >
          <Upload className="w-4 h-4 mr-1" />
          Upload
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleRename}
          disabled={!singleSelection || isLoading}
        >
          <Pencil className="w-4 h-4 mr-1" />
          Rename
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleDownload}
          disabled={!hasSelection || isLoading}
        >
          <Download className="w-4 h-4 mr-1" />
          Download
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={handleDelete}
          disabled={!hasSelection || isLoading}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Delete
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name.
            </DialogDescription>
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
            <AlertDialogTitle>Delete {selectedArray.length} item{selectedArray.length > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected item{selectedArray.length > 1 ? 's' : ''} will be permanently deleted.
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
