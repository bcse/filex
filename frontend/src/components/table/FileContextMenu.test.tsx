import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileContextMenu } from "./FileContextMenu";
import type { FileEntry } from "@/types/file";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  listDirectory: vi.fn(),
  getDownloadUrl: vi.fn((path: string) => `/download?path=${path}`),
  renameMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  navigationState: {
    setCurrentPath: vi.fn(),
    setDirectoryOffset: vi.fn(),
    selectedFiles: new Set<string>(),
    clearSelection: vi.fn(),
    sortConfig: { field: "mime_type", order: "desc" },
    directoryLimit: 20,
    setPendingFocusPath: vi.fn(),
    selectFile: vi.fn(),
  },
}));

vi.mock("@/api/client", () => ({
  api: {
    listDirectory: mocks.listDirectory,
    getDownloadUrl: mocks.getDownloadUrl,
  },
}));

vi.mock("@/hooks/useDirectory", () => ({
  useRename: () => ({ mutateAsync: mocks.renameMutateAsync }),
  useDelete: () => ({ mutateAsync: mocks.deleteMutateAsync }),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => mocks.navigationState,
}));

type ContextMenuProps = React.PropsWithChildren<{
  onOpenChange?: (open: boolean) => void;
}>;
type ChildrenOnlyProps = React.PropsWithChildren;
type ItemProps = React.PropsWithChildren<{ onClick?: () => void }>;

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children, onOpenChange }: ContextMenuProps) => (
    <div>
      <button onClick={() => onOpenChange?.(true)}>open-menu</button>
      {children}
    </div>
  ),
  ContextMenuTrigger: ({ children }: ChildrenOnlyProps) => (
    <div>{children}</div>
  ),
  ContextMenuContent: ({ children }: ChildrenOnlyProps) => (
    <div>{children}</div>
  ),
  ContextMenuItem: ({ children, onClick }: ItemProps) => (
    <button onClick={onClick}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuShortcut: ({ children }: ChildrenOnlyProps) => (
    <span>{children}</span>
  ),
}));

type DialogProps = { open: boolean; onConfirm: () => void };

vi.mock("@/components/dialogs/RenameDialog", () => ({
  RenameDialog: ({ open, onConfirm }: DialogProps) =>
    open ? <button onClick={onConfirm}>confirm-rename</button> : null,
}));

vi.mock("@/components/dialogs/DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: ({ open, onConfirm }: DialogProps) =>
    open ? <button onClick={onConfirm}>confirm-delete</button> : null,
}));

const entry: FileEntry = {
  name: "photo.png",
  path: "/photos/photo.png",
  is_dir: false,
};

describe("FileContextMenu", () => {
  beforeEach(() => {
    mocks.listDirectory.mockReset();
    mocks.getDownloadUrl.mockClear();
    mocks.renameMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.navigationState.setCurrentPath.mockClear();
    mocks.navigationState.setDirectoryOffset.mockClear();
    mocks.navigationState.clearSelection.mockClear();
    mocks.navigationState.setPendingFocusPath.mockClear();
    mocks.navigationState.selectFile.mockClear();
    mocks.navigationState.selectedFiles = new Set<string>();
  });

  it("triggers download for files", async () => {
    const user = userEvent.setup();

    render(
      <FileContextMenu entry={entry} onSelect={vi.fn()}>
        <div>child</div>
      </FileContextMenu>,
    );

    await user.click(screen.getByText("Download"));
    expect(mocks.getDownloadUrl).toHaveBeenCalledWith(entry.path);
  });

  it("skips folders when downloading mixed selections", async () => {
    const user = userEvent.setup();
    mocks.navigationState.selectedFiles = new Set<string>([
      "/photos/photo.png",
      "/photos/Album",
    ]);
    const resolveEntry = (path: string) =>
      path === "/photos/Album"
        ? { name: "Album", path, is_dir: true }
        : { name: "photo.png", path, is_dir: false };

    render(
      <FileContextMenu
        entry={entry}
        onSelect={vi.fn()}
        resolveEntry={resolveEntry}
      >
        <div>child</div>
      </FileContextMenu>,
    );

    await user.click(screen.getByText("Download"));

    expect(mocks.getDownloadUrl).toHaveBeenCalledTimes(1);
    expect(mocks.getDownloadUrl).toHaveBeenCalledWith("/photos/photo.png");
  });

  it("renames via dialog confirmation", async () => {
    const user = userEvent.setup();

    render(
      <FileContextMenu entry={entry} onSelect={vi.fn()}>
        <div>child</div>
      </FileContextMenu>,
    );

    await user.click(screen.getByText("Rename"));
    await user.click(screen.getByText("confirm-rename"));

    expect(mocks.renameMutateAsync).toHaveBeenCalledWith({
      path: entry.path,
      newName: entry.name,
    });
    expect(mocks.navigationState.clearSelection).toHaveBeenCalled();
  });

  it("deletes all selected files", async () => {
    const user = userEvent.setup();
    mocks.navigationState.selectedFiles = new Set<string>([
      "/photos/photo.png",
      "/photos/other.png",
    ]);

    render(
      <FileContextMenu entry={entry} onSelect={vi.fn()}>
        <div>child</div>
      </FileContextMenu>,
    );

    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("confirm-delete"));

    expect(mocks.deleteMutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMutateAsync).toHaveBeenNthCalledWith(1, {
      path: "/photos/photo.png",
      suppressToast: true,
    });
    expect(mocks.deleteMutateAsync).toHaveBeenNthCalledWith(2, {
      path: "/photos/other.png",
      suppressToast: true,
    });
    expect(mocks.navigationState.clearSelection).toHaveBeenCalled();
  });

  it("navigates to parent folder and resolves offset", async () => {
    const user = userEvent.setup();
    const dirEntry: FileEntry = {
      name: "child",
      path: "/parent/child",
      is_dir: true,
    };

    mocks.listDirectory.mockResolvedValue({
      entries: [{ name: "child", path: "/parent/child", is_dir: true }],
      offset: 0,
      limit: 20,
      total: 1,
    });

    render(
      <FileContextMenu entry={dirEntry} onSelect={vi.fn()} showGoToParent>
        <div>child</div>
      </FileContextMenu>,
    );

    await user.click(screen.getByText("Go to parent folder"));

    expect(mocks.navigationState.setCurrentPath).toHaveBeenCalledWith(
      "/parent",
    );
    expect(mocks.navigationState.setPendingFocusPath).toHaveBeenCalledWith(
      "/parent/child",
    );
    expect(mocks.navigationState.selectFile).toHaveBeenCalledWith(
      "/parent/child",
    );
    expect(mocks.listDirectory).toHaveBeenCalledWith("/parent", {
      offset: 0,
      limit: 1000,
      sort_by: "type",
      sort_order: "desc",
    });

    await waitFor(() => {
      expect(mocks.navigationState.setDirectoryOffset).toHaveBeenCalledWith(0, {
        replaceHistory: true,
      });
    });
  });
});
