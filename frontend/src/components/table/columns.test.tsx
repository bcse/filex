import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { columns, searchColumns } from "./columns";
import type { FileEntry } from "@/types/file";

const baseEntry: FileEntry = {
  name: "report.pdf",
  path: "/docs/report.pdf",
  is_dir: false,
  size: 1024,
  created: "2024-01-02T03:04:05",
  modified: "2024-02-03T04:05:06",
  mime_type: "application/pdf",
  width: 1920,
  height: 1080,
  duration: 125,
};

function renderColumn(entry: FileEntry, columnIndex: number) {
  return render(<>{columns[columnIndex].render(entry)}</>);
}

describe("columns", () => {
  it("renders size and date columns with formatted values", () => {
    const { getByText: getByTextSize } = renderColumn(baseEntry, 2);
    expect(getByTextSize("1 KB")).toBeInTheDocument();

    const { getByText: getByTextModified } = renderColumn(baseEntry, 3);
    expect(getByTextModified("2024-02-03 04:05")).toBeInTheDocument();
  });

  it("renders dimensions and duration columns with fallbacks", () => {
    const { getByText: getByTextDimensions } = renderColumn(baseEntry, 6);
    expect(getByTextDimensions("1920×1080")).toBeInTheDocument();

    const { getByText: getByTextDuration } = renderColumn(baseEntry, 7);
    expect(getByTextDuration("2:05")).toBeInTheDocument();
  });

  it("renders placeholders for folder and missing dates", () => {
    const folderEntry: FileEntry = {
      name: "Photos",
      path: "/Photos",
      is_dir: true,
      created: "not-a-date",
    };

    const { getByText: getByTextSize, unmount: unmountSize } = renderColumn(
      folderEntry,
      2,
    );
    expect(getByTextSize("-")).toBeInTheDocument();
    unmountSize();

    const { getByText: getByTextCreated, unmount: unmountCreated } =
      renderColumn(folderEntry, 4);
    expect(getByTextCreated("-")).toBeInTheDocument();
    unmountCreated();

    const { getByText: getByTextType, unmount: unmountType } = renderColumn(
      folderEntry,
      5,
    );
    expect(getByTextType("Folder")).toBeInTheDocument();
    unmountType();
  });

  it("renders path column for search results", () => {
    const pathColumn = searchColumns.find((column) => column.key === "path");
    expect(pathColumn).toBeTruthy();

    const { getByText } = render(<>{pathColumn!.render(baseEntry)}</>);
    expect(getByText("/docs")).toBeInTheDocument();
  });
});
