import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileGrid } from "./FileGrid";
import type { FileEntry } from "@/types/file";

type DirectoryState = {
  data?: { entries: FileEntry[] };
  isLoading: boolean;
  error: Error | null;
};

const mocks = vi.hoisted(() => ({
  directoryState: {
    data: { entries: [] as FileEntry[] },
    isLoading: false,
    error: null as Error | null,
  } as DirectoryState,
  navigationState: {
    currentPath: "/root",
    setCurrentPath: vi.fn(),
    selectedFiles: new Set<string>(),
    lastSelected: null as string | null,
    selectFile: vi.fn(),
    selectRange: vi.fn(),
    toggleSelection: vi.fn(),
    pendingFocusPath: null as string | null,
    setPendingFocusPath: vi.fn(),
    openPreview: vi.fn(),
  },
  getDownloadUrl: vi.fn((path: string) => `/download?path=${path}`),
}));

vi.mock("@/hooks/useDirectory", () => ({
  useDirectory: () => mocks.directoryState,
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => mocks.navigationState,
}));

vi.mock("@/api/client", () => ({
  api: { getDownloadUrl: mocks.getDownloadUrl },
}));

type ChildrenOnlyProps = React.PropsWithChildren;
type ContextMenuProps = ChildrenOnlyProps & {
  resolveEntry?: (path: string) => FileEntry | undefined;
};

vi.mock("./FileContextMenu", () => ({
  FileContextMenu: ({ children }: ContextMenuProps) => <div>{children}</div>,
}));

describe("FileGrid", () => {
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

  beforeEach(() => {
    mocks.navigationState.setCurrentPath.mockClear();
    mocks.navigationState.selectFile.mockClear();
    mocks.navigationState.selectRange.mockClear();
    mocks.navigationState.toggleSelection.mockClear();
    mocks.navigationState.openPreview.mockClear();
    mocks.navigationState.selectedFiles = new Set<string>();
    mocks.getDownloadUrl.mockClear();
    mocks.directoryState = {
      data: { entries: [] },
      isLoading: false,
      error: null,
    };
    openSpy.mockClear();
  });

  it("renders loading state", () => {
    mocks.directoryState = { data: undefined, isLoading: true, error: null };
    const { container } = render(<FileGrid />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders error state", () => {
    mocks.directoryState = {
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    };

    render(<FileGrid />);
    expect(
      screen.getByText("Error loading directory: boom"),
    ).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mocks.directoryState = {
      data: { entries: [] },
      isLoading: false,
      error: null,
    };

    render(<FileGrid />);
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("selects and opens entries", async () => {
    const user = userEvent.setup();
    const entries: FileEntry[] = [
      { name: "file.txt", path: "/root/file.txt", is_dir: false },
      { name: "Photos", path: "/root/Photos", is_dir: true },
    ];
    mocks.directoryState = { data: { entries }, isLoading: false, error: null };

    render(<FileGrid />);

    await user.click(screen.getByText("file.txt"));
    expect(mocks.navigationState.selectFile).toHaveBeenCalledWith(
      "/root/file.txt",
    );

    await user.dblClick(screen.getByText("file.txt"));
    expect(mocks.navigationState.openPreview).toHaveBeenCalledWith(entries[0]);

    await user.dblClick(screen.getByText("Photos"));
    expect(mocks.navigationState.setCurrentPath).toHaveBeenCalledWith(
      "/root/Photos",
    );
  });

  it("toggles selection with ctrl click", async () => {
    const entries: FileEntry[] = [
      { name: "file.txt", path: "/root/file.txt", is_dir: false },
    ];
    mocks.directoryState = { data: { entries }, isLoading: false, error: null };

    render(<FileGrid />);
    const target = screen.getByText("file.txt");
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ctrlKey: true }),
    );
    expect(mocks.navigationState.toggleSelection).toHaveBeenCalledWith(
      "/root/file.txt",
    );
  });
});
