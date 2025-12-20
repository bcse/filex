import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { FileTable } from "./FileTable";
import type { FileEntry } from "@/types/file";
import { performDropAction } from "@/components/dnd/dropActions";

const mocks = vi.hoisted(() => ({
  directoryState: {
    data: { entries: [] as FileEntry[] },
    isLoading: false,
    error: null as Error | null,
  },
  navigationState: {
    currentPath: "/root",
    setCurrentPath: vi.fn(),
    selectedFiles: new Set<string>(),
    lastSelected: null as string | null,
    selectFile: vi.fn(),
    selectRange: vi.fn(),
    toggleSelection: vi.fn(),
    sortConfig: { field: "name", order: "asc" },
    setSortConfig: vi.fn(),
    clearSelection: vi.fn(),
    pendingFocusPath: null as string | null,
    setPendingFocusPath: vi.fn(),
  },
  rename: { mutateAsync: vi.fn() },
  move: { mutateAsync: vi.fn() },
  copy: { mutateAsync: vi.fn() },
  getDownloadUrl: vi.fn((path: string) => `/download?path=${path}`),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => mocks.navigationState,
}));

vi.mock("@/hooks/useDirectory", () => ({
  useDirectory: () => mocks.directoryState,
  useRename: () => mocks.rename,
  useMove: () => mocks.move,
  useCopy: () => mocks.copy,
}));

vi.mock("@/hooks/useKeyboard", () => ({
  useKeyboard: (args: {
    entries: FileEntry[];
    onRename: (path: string) => void;
  }) => {
    lastKeyboardArgs = args;
  },
}));

vi.mock("@/api/client", () => ({
  api: { getDownloadUrl: mocks.getDownloadUrl },
}));

type TableViewMockProps = {
  entries: FileEntry[];
  afterRows?: React.ReactNode;
  getRowClassName?: (entry: FileEntry) => string;
  getRowProps?: (entry: FileEntry) => {
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent) => void;
    onDragEnd?: (event: React.DragEvent) => void;
    onDragOver?: (event: React.DragEvent) => void;
    onDragLeave?: (event: React.DragEvent) => void;
    onDrop?: (event: React.DragEvent) => void;
  };
  onRowClick?: (entry: FileEntry, event: React.MouseEvent) => void;
  onSort?: (field: string) => void;
  onRowDoubleClick?: (entry: FileEntry) => void;
  onScrolledToKey?: (key: string) => void;
  scrollToKey?: string | null;
  wrapRow?: (entry: FileEntry, row: React.ReactNode) => React.ReactNode;
};

let lastTableViewProps: TableViewMockProps | null = null;
let lastDropPromptProps: {
  dropPrompt: unknown;
  onClose: () => void;
  onAction: (action: string) => void;
} | null = null;
let lastRenameDialogProps: {
  open: boolean;
  value: string;
  onOpenChange: (value: boolean) => void;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
} | null = null;
let lastKeyboardArgs: {
  entries: FileEntry[];
  onRename: (path: string) => void;
} | null = null;
let lastContextMenuProps: { onSelect: () => void } | null = null;

const createDataTransfer = (initialData?: Record<string, string>) => {
  const store = new Map(Object.entries(initialData ?? {}));
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ""),
  };
};

vi.mock("@/components/table/FileTableView", () => ({
  FileTableView: (props: TableViewMockProps) => {
    lastTableViewProps = props;
    return <div data-testid="table-view" />;
  },
}));

vi.mock("@/components/dnd/DropPrompt", () => ({
  DropPrompt: (props: {
    dropPrompt: unknown;
    onClose: () => void;
    onAction: (action: string) => void;
  }) => {
    lastDropPromptProps = props;
    return null;
  },
  DropPromptState: null,
  DropAction: null,
}));

vi.mock("@/components/dnd/dropActions", () => ({
  performDropAction: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/components/dialogs/RenameDialog", () => ({
  RenameDialog: (props: {
    open: boolean;
    value: string;
    onOpenChange: (value: boolean) => void;
    onValueChange: (value: string) => void;
    onConfirm: () => void;
  }) => {
    lastRenameDialogProps = props;
    return null;
  },
}));

type ChildrenOnlyProps = React.PropsWithChildren;
type ContextMenuProps = ChildrenOnlyProps & {
  onSelect: () => void;
  resolveEntry?: (path: string) => FileEntry | undefined;
};

vi.mock("./FileContextMenu", () => ({
  FileContextMenu: ({ children, onSelect }: ContextMenuProps) => {
    lastContextMenuProps = { onSelect };
    return <div>{children}</div>;
  },
}));

describe("FileTable", () => {
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

  beforeEach(() => {
    mocks.directoryState = {
      data: { entries: [] },
      isLoading: false,
      error: null,
    };
    mocks.navigationState.selectedFiles = new Set<string>();
    mocks.navigationState.lastSelected = null;
    mocks.navigationState.pendingFocusPath = null;
    mocks.navigationState.setSortConfig.mockClear();
    mocks.navigationState.setCurrentPath.mockClear();
    mocks.navigationState.selectFile.mockClear();
    mocks.navigationState.selectRange.mockClear();
    mocks.navigationState.toggleSelection.mockClear();
    mocks.navigationState.clearSelection.mockClear();
    mocks.navigationState.setPendingFocusPath.mockClear();
    mocks.getDownloadUrl.mockClear();
    mocks.rename.mutateAsync.mockClear();
    mocks.move.mutateAsync.mockClear();
    mocks.copy.mutateAsync.mockClear();
    lastTableViewProps = null;
    lastDropPromptProps = null;
    lastRenameDialogProps = null;
    lastKeyboardArgs = null;
    lastContextMenuProps = null;
    openSpy.mockClear();
    vi.mocked(performDropAction).mockClear();
  });

  it("normalizes entry paths and toggles sort order", () => {
    mocks.directoryState = {
      data: {
        entries: [{ name: "file.txt", path: "/wrong", is_dir: false }],
      },
      isLoading: false,
      error: null,
    };

    render(<FileTable />);

    expect(lastTableViewProps?.entries[0].path).toBe("/root/file.txt");

    lastTableViewProps?.onSort?.("name");
    expect(mocks.navigationState.setSortConfig).toHaveBeenCalledWith({
      field: "name",
      order: "desc",
    });

    lastTableViewProps?.onSort?.("size");
    expect(mocks.navigationState.setSortConfig).toHaveBeenCalledWith({
      field: "size",
      order: "asc",
    });
  });

  it("handles row double click for directories and files", () => {
    mocks.directoryState = {
      data: {
        entries: [
          { name: "Docs", path: "/root/Docs", is_dir: true },
          { name: "file.txt", path: "/root/file.txt", is_dir: false },
        ],
      },
      isLoading: false,
      error: null,
    };

    render(<FileTable />);

    lastTableViewProps?.onRowDoubleClick?.(
      mocks.directoryState.data!.entries[0],
    );
    expect(mocks.navigationState.setCurrentPath).toHaveBeenCalledWith(
      "/root/Docs",
    );

    lastTableViewProps?.onRowDoubleClick?.(
      mocks.directoryState.data!.entries[1],
    );
    expect(mocks.getDownloadUrl).toHaveBeenCalledWith("/root/file.txt");
  });

  it("renders loading and error states", () => {
    mocks.directoryState = {
      data: { entries: [] },
      isLoading: true,
      error: null,
    };

    const { container, rerender } = render(<FileTable />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    mocks.directoryState = {
      data: { entries: [] },
      isLoading: false,
      error: new Error("boom"),
    };

    rerender(<FileTable />);
    expect(
      screen.getByText("Error loading directory: boom"),
    ).toBeInTheDocument();
  });

  it("opens rename dialog from keyboard handler and confirms rename", async () => {
    mocks.directoryState = {
      data: {
        entries: [{ name: "file.txt", path: "/root/file.txt", is_dir: false }],
      },
      isLoading: false,
      error: null,
    };

    render(<FileTable />);

    act(() => {
      lastKeyboardArgs?.onRename("/root/file.txt");
    });

    expect(lastRenameDialogProps?.open).toBe(true);
    expect(lastRenameDialogProps?.value).toBe("file.txt");

    await act(async () => {
      await lastRenameDialogProps?.onConfirm();
    });

    expect(mocks.rename.mutateAsync).toHaveBeenCalledWith({
      path: "/root/file.txt",
      newName: "file.txt",
    });
    expect(mocks.navigationState.clearSelection).toHaveBeenCalled();
  });

  it("selects ranges and toggles selection on row clicks", () => {
    mocks.directoryState = {
      data: {
        entries: [
          { name: "A", path: "/root/A", is_dir: false },
          { name: "B", path: "/root/B", is_dir: false },
          { name: "C", path: "/root/C", is_dir: false },
        ],
      },
      isLoading: false,
      error: null,
    };
    mocks.navigationState.lastSelected = "/root/A";
    mocks.navigationState.selectedFiles = new Set<string>();

    render(<FileTable />);

    lastTableViewProps?.onRowClick?.(mocks.directoryState.data!.entries[2], {
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    } as React.MouseEvent);

    expect(mocks.navigationState.selectRange).toHaveBeenCalledWith([
      "/root/A",
      "/root/B",
      "/root/C",
    ]);

    lastTableViewProps?.onRowClick?.(mocks.directoryState.data!.entries[0], {
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
    } as React.MouseEvent);
    expect(mocks.navigationState.toggleSelection).toHaveBeenCalledWith(
      "/root/A",
    );
  });

  it("wraps rows with context menu selection behavior", () => {
    mocks.directoryState = {
      data: {
        entries: [{ name: "Item", path: "/root/Item", is_dir: false }],
      },
      isLoading: false,
      error: null,
    };
    mocks.navigationState.selectedFiles = new Set<string>();

    render(<FileTable />);

    const wrapped = lastTableViewProps?.wrapRow?.(
      mocks.directoryState.data!.entries[0],
      <div>row</div>,
    );

    render(<>{wrapped}</>);

    lastContextMenuProps?.onSelect();
    expect(mocks.navigationState.selectFile).toHaveBeenCalledWith("/root/Item");
  });

  it("clears pending focus when the row is scrolled into view", () => {
    mocks.directoryState = {
      data: {
        entries: [{ name: "focus", path: "/root/focus", is_dir: false }],
      },
      isLoading: false,
      error: null,
    };
    mocks.navigationState.pendingFocusPath = "/root/focus";

    render(<FileTable />);

    lastTableViewProps?.onScrolledToKey?.("/root/focus");
    expect(mocks.navigationState.setPendingFocusPath).toHaveBeenCalledWith(
      null,
    );
  });

  it("renders the empty state when there are no entries", () => {
    mocks.directoryState = {
      data: { entries: [] },
      isLoading: false,
      error: null,
    };

    render(<FileTable />);

    render(<>{lastTableViewProps?.afterRows}</>);
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("updates drag state and shows drop prompts", () => {
    mocks.directoryState = {
      data: {
        entries: [
          { name: "Alpha", path: "/root/Alpha", is_dir: false },
          { name: "Folder", path: "/root/Folder", is_dir: true },
        ],
      },
      isLoading: false,
      error: null,
    };
    mocks.navigationState.selectedFiles = new Set<string>(["/root/Alpha"]);

    render(<FileTable />);

    const fileEntry = mocks.directoryState.data!.entries[0];
    const folderEntry = mocks.directoryState.data!.entries[1];
    const fileRowProps = lastTableViewProps?.getRowProps?.(fileEntry);
    const folderRowProps = lastTableViewProps?.getRowProps?.(folderEntry);

    const dragTransfer = createDataTransfer();

    act(() => {
      fileRowProps?.onDragStart?.({
        dataTransfer: dragTransfer,
      } as unknown as React.DragEvent);
    });

    expect(dragTransfer.setData).toHaveBeenCalledWith(
      "application/x-file-paths",
      JSON.stringify(["/root/Alpha"]),
    );
    expect(dragTransfer.effectAllowed).toBe("copyMove");
    expect(lastTableViewProps?.getRowClassName?.(fileEntry)).toContain(
      "opacity-50",
    );

    const dragOverTransfer = createDataTransfer();
    const preventDefault = vi.fn();

    act(() => {
      folderRowProps?.onDragOver?.({
        preventDefault,
        dataTransfer: dragOverTransfer,
      } as unknown as React.DragEvent);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(dragOverTransfer.dropEffect).toBe("copy");
    expect(lastTableViewProps?.getRowClassName?.(folderEntry)).toContain(
      "bg-primary/20",
    );

    act(() => {
      fileRowProps?.onDragEnd?.({} as unknown as React.DragEvent);
    });

    expect(lastTableViewProps?.getRowClassName?.(fileEntry)).not.toContain(
      "opacity-50",
    );
  });

  it("builds drop prompts and dispatches drop actions", async () => {
    mocks.directoryState = {
      data: {
        entries: [
          { name: "Alpha", path: "/root/Alpha", is_dir: false },
          { name: "Folder", path: "/root/Folder", is_dir: true },
        ],
      },
      isLoading: false,
      error: null,
    };

    render(<FileTable />);

    const folderEntry = mocks.directoryState.data!.entries[1];
    const folderRowProps = lastTableViewProps?.getRowProps?.(folderEntry);
    const dropTransfer = createDataTransfer({
      "application/x-file-paths": JSON.stringify(["/root/Alpha"]),
    });

    act(() => {
      folderRowProps?.onDrop?.({
        preventDefault: vi.fn(),
        dataTransfer: dropTransfer,
        clientX: 10,
        clientY: 20,
      } as unknown as React.DragEvent);
    });

    expect(lastDropPromptProps?.dropPrompt).toMatchObject({
      paths: ["/root/Alpha"],
      targetPath: "/root/Folder",
      x: 10,
      y: 20,
    });

    const dropPrompt = lastDropPromptProps?.dropPrompt;

    await act(async () => {
      await lastDropPromptProps?.onAction("move");
    });

    expect(performDropAction).toHaveBeenCalledWith({
      action: "move",
      dropPrompt,
      move: mocks.move,
      copy: mocks.copy,
      clearSelection: mocks.navigationState.clearSelection,
    });
  });
});
