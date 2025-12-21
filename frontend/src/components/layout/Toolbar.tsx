import React, { useMemo, useRef, useState } from "react";
import {
  FolderPlus,
  Trash2,
  Download,
  Upload,
  TextCursorInput,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RenameDialog } from "@/components/dialogs/RenameDialog";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { useNavigationStore } from "@/stores/navigation";
import {
  useCreateDirectory,
  useDirectory,
  useDelete,
  useRename,
  useUploadWithProgress,
} from "@/hooks/useDirectory";
import { api } from "@/api/client";
import { buildEntryPath } from "@/lib/utils";
import type { FileEntry } from "@/types/file";

export function Toolbar() {
  const {
    currentPath,
    selectedFiles,
    clearSelection,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
  } = useNavigationStore();

  // Dialog states
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // File input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createDir = useCreateDirectory();
  const deleteFile = useDelete();
  const rename = useRename();
  const { uploadFiles } = useUploadWithProgress();
  const { data } = useDirectory(currentPath);

  const selectedArray = Array.from(selectedFiles);
  const hasSelection = selectedArray.length > 0;
  const singleSelection = selectedArray.length === 1;
  const entryLookup = useMemo(() => {
    const map = new Map<string, FileEntry>();
    for (const entry of data?.entries ?? []) {
      const path = buildEntryPath(entry.name, entry.path, currentPath);
      const normalizedEntry = entry.path === path ? entry : { ...entry, path };
      map.set(path, normalizedEntry);
    }
    return map;
  }, [currentPath, data?.entries]);
  const downloadablePaths = useMemo(
    () =>
      selectedArray.filter((path) => {
        const entry = entryLookup.get(path);
        return entry ? !entry.is_dir : true;
      }),
    [entryLookup, selectedArray],
  );
  const hasDownloadableSelection = downloadablePaths.length > 0;

  // New Folder
  const handleNewFolder = () => {
    setNewFolderName("New Folder");
    setNewFolderOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const path =
      currentPath === "/"
        ? `/${newFolderName.trim()}`
        : `${currentPath}/${newFolderName.trim()}`;
    await createDir.mutateAsync(path);
    setNewFolderOpen(false);
    setNewFolderName("");
  };

  // Delete
  const handleDelete = () => {
    if (!hasSelection) return;
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!hasSelection) return;
    const shouldSummarize = selectedArray.length > 1;
    let successCount = 0;
    let errorCount = 0;

    for (const path of selectedArray) {
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
    setDeleteConfirmOpen(false);
  };

  // Rename
  const handleRename = () => {
    if (!singleSelection) return;
    const path = selectedArray[0];
    const name = path.split("/").pop() || "";
    setRenameValue(name);
    setRenameOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renameValue.trim() || !singleSelection) return;
    const path = selectedArray[0];
    await rename.mutateAsync({ path, newName: renameValue.trim() });
    clearSelection();
    setRenameOpen(false);
    setRenameValue("");
  };

  // Download
  const handleDownload = () => {
    for (const path of downloadablePaths) {
      const url = api.getDownloadUrl(path);
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || "download";
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
    await uploadFiles(currentPath, files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isLoading =
    createDir.isPending || deleteFile.isPending || rename.isPending;

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNewFolder}
          disabled={isLoading}
          title="New folder"
        >
          {createDir.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderPlus className="w-4 h-4" />
          )}
          <span className="sr-only">New folder</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleUploadClick}
          disabled={isLoading}
          title="Upload"
        >
          <Upload className="w-4 h-4" />
          <span className="sr-only">Upload</span>
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
          size="icon"
          className="h-8 w-8"
          onClick={handleRename}
          disabled={!singleSelection || isLoading}
          title="Rename"
        >
          {rename.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TextCursorInput className="w-4 h-4" />
          )}
          <span className="sr-only">Rename</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDownload}
          disabled={!hasDownloadableSelection || isLoading}
          title="Download"
        >
          <Download className="w-4 h-4" />
          <span className="sr-only">Download</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:text-red-400 dark:hover:bg-red-950"
          onClick={handleDelete}
          disabled={!hasSelection || isLoading}
          title="Delete"
        >
          {deleteFile.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          <span className="sr-only">Delete</span>
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
                if (e.key === "Enter") handleCreateFolder();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onConfirm={handleConfirmRename}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleConfirmDelete}
        itemCount={selectedArray.length}
      />
    </>
  );
}
