import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useDirectory: vi.fn(),
  useSearch: vi.fn(),
  uploadFiles: vi.fn(),
}));

const navigationStore = vi.hoisted(() => ({
  state: {
    currentPath: "/",
    isSearching: false,
    searchQuery: "",
    directoryOffset: 0,
    directoryLimit: 100,
    searchOffset: 0,
    searchLimit: 100,
    setDirectoryOffset: vi.fn(),
    setSearchOffset: vi.fn(),
  },
}));

vi.mock("@/hooks/useDirectory", () => ({
  useDirectory: (...args: unknown[]) => mocks.useDirectory(...args),
  useUploadWithProgress: () => ({ uploadFiles: mocks.uploadFiles }),
}));

vi.mock("@/hooks/useSearch", () => ({
  useSearch: (...args: unknown[]) => mocks.useSearch(...args),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => navigationStore.state,
}));

vi.mock("@/components/table/FileTable", () => ({
  FileTable: () => <div>FileTable</div>,
}));

vi.mock("@/components/search/SearchResults", () => ({
  SearchResults: () => <div>SearchResults</div>,
}));

import { MainPanel } from "./MainPanel";

describe("MainPanel", () => {
  beforeEach(() => {
    mocks.useDirectory.mockReturnValue({ data: { total: 0 } });
    mocks.useSearch.mockReturnValue({ data: { total: 0 } });
    mocks.uploadFiles.mockReset();
    navigationStore.state = {
      currentPath: "/",
      isSearching: false,
      searchQuery: "",
      directoryOffset: 0,
      directoryLimit: 100,
      searchOffset: 0,
      searchLimit: 100,
      setDirectoryOffset: vi.fn(),
      setSearchOffset: vi.fn(),
    };
  });

  it("renders the table view when not searching", () => {
    render(<MainPanel />);

    expect(screen.getByText("FileTable")).toBeInTheDocument();
    expect(screen.queryByText("SearchResults")).toBeNull();
  });

  it("renders search results when search is active", () => {
    navigationStore.state = {
      ...navigationStore.state,
      isSearching: true,
      searchQuery: "ab",
    };

    render(<MainPanel />);

    expect(screen.getByText("SearchResults")).toBeInTheDocument();
  });

  it("calls uploadFiles on drop", () => {
    const { container } = render(<MainPanel />);
    const panel = container.firstChild as HTMLElement;
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    fireEvent.dragEnter(panel, {
      dataTransfer: { types: ["Files"] },
    });
    expect(screen.getByText("Drop files to upload")).toBeInTheDocument();

    fireEvent.drop(panel, {
      dataTransfer: { files: [file] },
    });

    expect(mocks.uploadFiles).toHaveBeenCalledWith("/", [file]);
  });

  it("updates pagination offset when a page is selected", () => {
    navigationStore.state = {
      ...navigationStore.state,
      directoryLimit: 100,
    };
    mocks.useDirectory.mockReturnValue({ data: { total: 2000 } });

    render(<MainPanel />);

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(navigationStore.state.setDirectoryOffset).toHaveBeenCalledWith(100);
  });
});
