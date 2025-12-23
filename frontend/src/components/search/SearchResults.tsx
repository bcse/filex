import React, { useMemo, useCallback, useState } from "react";
import { Loader2, FolderOpen, Search } from "lucide-react";
import { FileContextMenu } from "@/components/table/FileContextMenu";
import type { FileEntry } from "@/types/file";
import { useNavigationStore } from "@/stores/navigation";
import { useSearch } from "@/hooks/useSearch";
import { useMove, useCopy, useRename } from "@/hooks/useDirectory";
import { useKeyboard } from "@/hooks/useKeyboard";
import { api } from "@/api/client";
import { isTauri, resolveLocalPath } from "@/lib/config";
import { openLocalPath } from "@/lib/tauri";
import type { SortField } from "@/types/file";
import { searchColumns } from "@/components/table/columns";
import { FileTableView } from "@/components/table/FileTableView";
import { cn } from "@/lib/utils";
import { isPreviewableFile } from "@/lib/filePreview";
import {
  DropPrompt,
  DropPromptState,
  DropAction,
} from "@/components/dnd/DropPrompt";
import { performDropAction } from "@/components/dnd/dropActions";
import { RenameDialog } from "@/components/dialogs/RenameDialog";

function toRow(entry: FileEntry): FileEntry {
  return {
    name: entry.name,
    path: entry.path,
    is_dir: entry.is_dir,
    size: entry.size ?? undefined,
    created: entry.created,
    modified: entry.modified,
    mime_type: entry.mime_type ?? undefined,
    width: entry.width ?? undefined,
    height: entry.height ?? undefined,
    duration: entry.duration ?? undefined,
  };
}

export function SearchResults() {
  const {
    searchQuery,
    setIsSearching,
    selectedFiles,
    lastSelected,
    selectFile,
    selectRange,
    toggleSelection,
    setCurrentPath,
    searchSortConfig,
    setSearchSortConfig,
    clearSelection,
    openPreview,
  } = useNavigationStore();
  const { data, isLoading, error } = useSearch(searchQuery, { enabled: true });
  const move = useMove();
  const copy = useCopy();
  const rename = useRename();
  const rows = useMemo(() => (data?.entries || []).map(toRow), [data?.entries]);
  const entryLookup = useMemo(() => {
    const map = new Map<string, FileEntry>();
    for (const entry of rows) {
      map.set(entry.path, entry);
    }
    return map;
  }, [rows]);
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropPrompt, setDropPrompt] = useState<DropPromptState>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePath, setRenamePath] = useState("");

  const handleSort = (field: SortField) => {
    setSearchSortConfig({
      field,
      order:
        searchSortConfig.field === field && searchSortConfig.order === "asc"
          ? "desc"
          : "asc",
    });
  };

  const handleRowClick = useCallback(
    (row: ReturnType<typeof toRow>, e: React.MouseEvent) => {
      if (e.shiftKey) {
        const paths = rows.map((item) => item.path);
        const anchor =
          lastSelected && paths.includes(lastSelected)
            ? lastSelected
            : row.path;
        const start = paths.indexOf(anchor);
        const end = paths.indexOf(row.path);
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const rangePaths = paths.slice(from, to + 1);
          selectRange([...Array.from(selectedFiles), ...rangePaths]);
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        toggleSelection(row.path);
      } else {
        selectFile(row.path);
      }
    },
    [
      lastSelected,
      rows,
      selectFile,
      selectRange,
      selectedFiles,
      toggleSelection,
    ],
  );

  const handleRowDoubleClick = useCallback(
    async (row: ReturnType<typeof toRow>) => {
      if (row.is_dir) {
        setIsSearching(false);
        setCurrentPath(row.path);
        return;
      }
      const localPath = resolveLocalPath(row.path);
      if (localPath) {
        const opened = await openLocalPath(
          localPath,
          api.getDownloadUrl(row.path),
        );
        if (!opened && isPreviewableFile(row)) {
          openPreview(row);
        }
        return;
      }
      if (isPreviewableFile(row)) {
        openPreview(row);
        return;
      }
      if (!isTauri()) {
        window.open(api.getDownloadUrl(row.path), "_blank");
      }
    },
    [openPreview, setCurrentPath, setIsSearching],
  );

  const handleRenameRequest = useCallback((path: string) => {
    const name = path.split("/").pop() || "";
    setRenamePath(path);
    setRenameValue(name);
    setRenameOpen(true);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renameValue.trim() || !renamePath) return;
    await rename.mutateAsync({ path: renamePath, newName: renameValue.trim() });
    clearSelection();
    setRenameOpen(false);
    setRenamePath("");
    setRenameValue("");
  }, [clearSelection, rename, renamePath, renameValue]);

  useKeyboard({ entries: rows, onRename: handleRenameRequest });

  const handleDragStart = useCallback(
    (e: React.DragEvent, entry: ReturnType<typeof toRow>) => {
      const path = entry.path;
      const paths = selectedFiles.has(path)
        ? Array.from(selectedFiles)
        : [path];

      setDraggedPaths(paths);
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-file-paths", JSON.stringify(paths));
    },
    [selectedFiles],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPaths([]);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, entry: ReturnType<typeof toRow>) => {
      const path = entry.path;
      if (!entry.is_dir || draggedPaths.includes(path)) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropTarget(path);
    },
    [draggedPaths],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDropAction = useCallback(
    async (action: DropAction) => {
      await performDropAction({
        action,
        dropPrompt,
        move,
        copy,
        clearSelection,
      });
      setDropPrompt(null);
    },
    [clearSelection, copy, dropPrompt, move],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetEntry: ReturnType<typeof toRow>) => {
      e.preventDefault();
      setDropTarget(null);

      if (!targetEntry.is_dir) return;
      const targetPath = targetEntry.path;

      const data = e.dataTransfer.getData("application/x-file-paths");
      if (!data) return;

      try {
        const paths: string[] = JSON.parse(data);

        if (paths.includes(targetPath)) return;

        setDropPrompt({
          paths,
          targetPath,
          x: e.clientX,
          y: e.clientY,
        });
      } catch (error) {
        console.error("Drop failed:", error);
      }
    },
    [],
  );

  const getRowProps = useCallback(
    (entry: ReturnType<typeof toRow>) => ({
      draggable: true,
      onDragStart: (event: React.DragEvent) => handleDragStart(event, entry),
      onDragEnd: handleDragEnd,
      onDragOver: (event: React.DragEvent) => handleDragOver(event, entry),
      onDragLeave: handleDragLeave,
      onDrop: (event: React.DragEvent) => handleDrop(event, entry),
    }),
    [
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    ],
  );

  if (!searchQuery || searchQuery.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Search className="w-10 h-10 mb-2 opacity-60" />
        <p className="text-sm">Type to search files</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error searching: {(error as Error).message}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-base font-medium">No results</p>
        <p className="text-sm">Try a different query.</p>
      </div>
    );
  }

  return (
    <>
      <FileTableView
        columns={searchColumns}
        entries={rows}
        sortConfig={searchSortConfig}
        onSort={(field) => handleSort(field)}
        estimateSize={40}
        selectedPaths={selectedFiles}
        getRowKey={(entry) => entry.path}
        getRowClassName={(entry) =>
          cn(
            dropTarget === entry.path &&
              "bg-primary/20 border-primary border-2",
            draggedPaths.includes(entry.path) && "opacity-50",
          )
        }
        getRowProps={getRowProps}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        wrapRow={(entry, row) => (
          <FileContextMenu
            entry={entry}
            showGoToParent
            resolveEntry={(path) => entryLookup.get(path)}
            onSelect={() => {
              if (!selectedFiles.has(entry.path)) {
                selectFile(entry.path);
              }
            }}
          >
            {row}
          </FileContextMenu>
        )}
      />

      <DropPrompt
        dropPrompt={dropPrompt}
        onClose={() => setDropPrompt(null)}
        onAction={handleDropAction}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onConfirm={handleConfirmRename}
      />
    </>
  );
}
