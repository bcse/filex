import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchResults } from "./SearchResults";
import { useSearch } from "@/hooks/useSearch";
import { useNavigationStore } from "@/stores/navigation";
import { useMove, useCopy, useRename } from "@/hooks/useDirectory";
import { useKeyboard } from "@/hooks/useKeyboard";
import { api } from "@/api/client";
import type { FileEntry, SearchResponse } from "@/types/file";

let latestTableProps: Record<string, unknown> | null = null;

vi.mock("@/hooks/useSearch", () => ({
  useSearch: vi.fn(),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: vi.fn(),
}));

vi.mock("@/hooks/useDirectory", () => ({
  useMove: vi.fn(),
  useCopy: vi.fn(),
  useRename: vi.fn(),
}));

vi.mock("@/hooks/useKeyboard", () => ({
  useKeyboard: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: { getDownloadUrl: vi.fn((path: string) => `/download${path}`) },
}));

vi.mock("@/components/table/FileTableView", () => ({
  FileTableView: (props: Record<string, unknown>) => {
    latestTableProps = props;
    const entries = props.entries as Array<{ path: string }> | undefined;
    const row = <div data-testid="row" />;
    const wrapped =
      props.wrapRow && entries?.length
        ? (props.wrapRow as (entry: unknown, row: React.ReactNode) => unknown)(
            entries[0],
            row,
          )
        : row;
    return <div data-testid="table">{wrapped as React.ReactNode}</div>;
  },
}));

vi.mock("@/components/table/FileContextMenu", () => ({
  FileContextMenu: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    resolveEntry?: (path: string) => FileEntry | undefined;
  }) => (
    <button type="button" data-testid="context" onClick={onSelect}>
      {children}
    </button>
  ),
}));

const baseNavigationState = () => ({
  searchQuery: "",
  setIsSearching: vi.fn(),
  selectedFiles: new Set<string>(),
  lastSelected: null as string | null,
  selectFile: vi.fn(),
  selectRange: vi.fn(),
  toggleSelection: vi.fn(),
  setCurrentPath: vi.fn(),
  searchSortConfig: { field: "name", order: "asc" as const },
  setSearchSortConfig: vi.fn(),
  clearSelection: vi.fn(),
  openPreview: vi.fn(),
});

const makeEntries = (): FileEntry[] => [
  { name: "one", path: "/one", is_dir: false },
  { name: "two", path: "/two", is_dir: false },
  { name: "three", path: "/three", is_dir: true },
];

const makeSearchResponse = (
  entries: FileEntry[] = [],
  query = "ab",
): SearchResponse => ({
  query,
  entries,
  offset: 0,
  limit: 50,
  total: entries.length,
});

const mockSearchResult = (result: {
  data?: SearchResponse;
  isLoading?: boolean;
  error?: Error | null;
}) => {
  vi.mocked(useSearch).mockReturnValue({
    data: result.data,
    isLoading: result.isLoading ?? false,
    error: result.error ?? null,
  } as unknown as ReturnType<typeof useSearch>);
};

describe("SearchResults", () => {
  beforeEach(() => {
    latestTableProps = null;
    vi.mocked(useMove).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMove>);
    vi.mocked(useCopy).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useCopy>);
    vi.mocked(useRename).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useRename>);
    vi.mocked(useKeyboard).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders prompt for short queries", () => {
    vi.mocked(useNavigationStore).mockReturnValue({
      ...baseNavigationState(),
      searchQuery: "a",
    });
    mockSearchResult({ data: undefined, isLoading: false, error: null });

    render(<SearchResults />);

    expect(screen.getByText("Type to search files")).toBeInTheDocument();
    expect(screen.queryByTestId("table")).not.toBeInTheDocument();
  });

  it("renders loading state", () => {
    vi.mocked(useNavigationStore).mockReturnValue({
      ...baseNavigationState(),
      searchQuery: "ab",
    });
    mockSearchResult({ data: undefined, isLoading: true, error: null });

    const { container } = render(<SearchResults />);

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders error state", () => {
    vi.mocked(useNavigationStore).mockReturnValue({
      ...baseNavigationState(),
      searchQuery: "ab",
    });
    mockSearchResult({
      data: undefined,
      isLoading: false,
      error: new Error("Boom"),
    });

    render(<SearchResults />);

    expect(screen.getByText("Error searching: Boom")).toBeInTheDocument();
  });

  it("renders empty results state", () => {
    vi.mocked(useNavigationStore).mockReturnValue({
      ...baseNavigationState(),
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse([]),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("renders results and selects via context menu", () => {
    const state = baseNavigationState();
    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);
    fireEvent.click(screen.getByTestId("context"));

    expect(state.selectFile).toHaveBeenCalledWith("/one");
  });

  it("toggles sort order", () => {
    const state = baseNavigationState();
    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
      searchSortConfig: { field: "name", order: "asc" },
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);
    (latestTableProps?.onSort as (field: string) => void)("name");

    expect(state.setSearchSortConfig).toHaveBeenCalledWith({
      field: "name",
      order: "desc",
    });
  });

  it("selects ranges on shift-click", () => {
    const state = baseNavigationState();
    state.selectedFiles = new Set(["/one"]);
    state.lastSelected = "/one";

    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);
    const row = (latestTableProps?.entries as Array<{ path: string }>)[2];
    (latestTableProps?.onRowClick as (row: unknown, event: unknown) => void)(
      row,
      { shiftKey: true } as React.MouseEvent,
    );

    expect(state.selectRange).toHaveBeenCalledWith(
      expect.arrayContaining(["/one", "/two", "/three"]),
    );
  });

  it("toggles selection on ctrl-click", () => {
    const state = baseNavigationState();
    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);
    const row = (latestTableProps?.entries as Array<{ path: string }>)[1];
    (latestTableProps?.onRowClick as (row: unknown, event: unknown) => void)(
      row,
      { ctrlKey: true } as React.MouseEvent,
    );

    expect(state.toggleSelection).toHaveBeenCalledWith("/two");
    expect(state.selectFile).not.toHaveBeenCalled();
  });

  it("handles directory double-clicks via navigation", () => {
    const state = baseNavigationState();
    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    render(<SearchResults />);
    const dirRow = (latestTableProps?.entries as Array<{ path: string }>)[2];
    (latestTableProps?.onRowDoubleClick as (row: unknown) => void)(dirRow);

    expect(state.setIsSearching).toHaveBeenCalledWith(false);
    expect(state.setCurrentPath).toHaveBeenCalledWith("/three");
  });

  it("opens files on double-click", () => {
    const state = baseNavigationState();
    vi.mocked(useNavigationStore).mockReturnValue({
      ...state,
      searchQuery: "ab",
    });
    mockSearchResult({
      data: makeSearchResponse(makeEntries()),
      isLoading: false,
      error: null,
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<SearchResults />);
    const fileRow = (latestTableProps?.entries as Array<{ path: string }>)[0];
    (latestTableProps?.onRowDoubleClick as (row: unknown) => void)(fileRow);

    expect(api.getDownloadUrl).toHaveBeenCalledWith("/one");
    expect(openSpy).toHaveBeenCalledWith("/download/one", "_blank");

    openSpy.mockRestore();
  });
});
