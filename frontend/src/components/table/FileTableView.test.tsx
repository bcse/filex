import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTableView } from "./FileTableView";
import type { Column } from "./columns";
import type { FileEntry } from "@/types/file";

const handleResizeStart = vi.fn();
const scrollToIndex = vi.fn();

vi.mock("@/hooks/useColumnResize", () => ({
  useColumnResize: () => ({
    handleResizeStart,
    getGridTemplate: () => "120px 1fr",
    getTotalWidth: () => 320,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        size: estimateSize(),
        start: index * estimateSize(),
      })),
    scrollToIndex,
  }),
}));

const columns: Column[] = [
  {
    key: "name",
    label: "Name",
    width: "1fr",
    sortable: true,
    resizable: true,
    render: (entry: FileEntry) => <span>{entry.name}</span>,
  },
  {
    key: "size",
    label: "Size",
    width: "100px",
    sortable: true,
    resizable: true,
    render: (entry: FileEntry) => <span>{entry.size}</span>,
  },
];

const entries: FileEntry[] = [
  { name: "Alpha", path: "/alpha", is_dir: false, size: 10 },
  { name: "Beta", path: "/beta", is_dir: false, size: 20 },
];

describe("FileTableView", () => {
  beforeEach(() => {
    handleResizeStart.mockClear();
    scrollToIndex.mockClear();
  });

  it("renders headers and calls onSort", async () => {
    const onSort = vi.fn();
    const user = userEvent.setup();

    render(
      <FileTableView
        columns={columns}
        entries={entries}
        sortConfig={{ field: "name", order: "asc" }}
        onSort={onSort}
      />,
    );

    await user.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("renders rows, applies wrappers, and handles clicks", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    render(
      <FileTableView
        columns={columns}
        entries={entries}
        selectedPaths={new Set(["/alpha"])}
        onRowClick={onRowClick}
        wrapRow={(entry, row) => (
          <div data-testid={`wrap-${entry.path}`}>{row}</div>
        )}
      />,
    );

    expect(screen.getByTestId("wrap-/alpha")).toBeInTheDocument();

    await user.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(entries[0], expect.any(Object));

    const alphaCell = screen.getByText("Alpha");
    const cell = alphaCell.closest("div");
    const row = cell?.parentElement;
    expect(row?.className).toContain("bg-accent");
  });

  it("calls resize handler for column handles", () => {
    const { container } = render(
      <FileTableView columns={columns} entries={entries} />,
    );

    const resizeHandles = container.querySelectorAll(".cursor-col-resize");
    expect(resizeHandles).toHaveLength(columns.length - 1);

    fireEvent.mouseDown(resizeHandles[0]);
    expect(handleResizeStart).toHaveBeenCalledWith("name", expect.any(Object));
  });

  it("does not call onSort for non-sortable columns", async () => {
    const onSort = vi.fn();
    const user = userEvent.setup();
    const mixedColumns: Column[] = [
      {
        key: "icon",
        label: "Icon",
        width: "40px",
        sortable: false,
        resizable: false,
        render: () => <span>Icon</span>,
      },
      ...columns,
    ];

    const { container } = render(
      <FileTableView
        columns={mixedColumns}
        entries={entries}
        sortConfig={{ field: "name", order: "asc" }}
        onSort={onSort}
      />,
    );

    const headerRow = container.querySelector(".sticky");
    const iconHeader =
      headerRow?.querySelector("span") ?? screen.getAllByText("Icon")[0];
    await user.click(iconHeader as HTMLElement);
    expect(onSort).not.toHaveBeenCalledWith("icon");
  });

  it("merges row props and handles double click", async () => {
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    const rowExtraOnClick = vi.fn();
    const rowExtraOnDoubleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <FileTableView
        columns={columns}
        entries={entries}
        onRowClick={onRowClick}
        onRowDoubleClick={onRowDoubleClick}
        getRowProps={() => ({
          className: "row-extra",
          style: { color: "red" },
          onClick: rowExtraOnClick,
          onDoubleClick: rowExtraOnDoubleClick,
        })}
      />,
    );

    const alphaCell = screen.getByText("Alpha");
    const row = alphaCell.closest("div")?.parentElement;
    expect(row).toHaveClass("row-extra");
    expect(row).toHaveStyle({ color: "rgb(255, 0, 0)" });

    await user.click(alphaCell);
    expect(rowExtraOnClick).toHaveBeenCalled();
    expect(onRowClick).toHaveBeenCalledWith(entries[0], expect.any(Object));

    await user.dblClick(alphaCell);
    expect(rowExtraOnDoubleClick).toHaveBeenCalled();
    expect(onRowDoubleClick).toHaveBeenCalledWith(entries[0]);
  });

  it("uses custom row keys for selection and renders afterRows", () => {
    render(
      <FileTableView
        columns={columns}
        entries={entries}
        getRowKey={(entry) => entry.name}
        selectedPaths={new Set(["Beta"])}
        afterRows={<div data-testid="after-rows">After rows</div>}
      />,
    );

    const betaCell = screen.getByText("Beta");
    const row = betaCell.closest("div")?.parentElement;
    expect(row?.className).toContain("bg-accent");
    expect(screen.getByTestId("after-rows")).toBeInTheDocument();
  });

  it("scrolls to a key and notifies when found", async () => {
    const onScrolledToKey = vi.fn();

    render(
      <FileTableView
        columns={columns}
        entries={entries}
        scrollToKey="/beta"
        onScrolledToKey={onScrolledToKey}
      />,
    );

    await waitFor(() => {
      expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
      expect(onScrolledToKey).toHaveBeenCalledWith("/beta");
    });
  });

  it("does not scroll when key is not found", async () => {
    render(
      <FileTableView columns={columns} entries={entries} scrollToKey="/nope" />,
    );

    await waitFor(() => {
      expect(scrollToIndex).not.toHaveBeenCalled();
    });
  });
});
