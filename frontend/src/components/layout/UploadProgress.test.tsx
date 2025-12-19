import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useUploadStore } from "@/stores/upload";
import { UploadProgress } from "./UploadProgress";

const resetUploads = () => {
  useUploadStore.setState({ uploads: new Map() });
};

describe("UploadProgress", () => {
  beforeEach(() => {
    resetUploads();
  });

  it("renders nothing when there are no uploads", () => {
    const { container } = render(<UploadProgress />);

    expect(container.firstChild).toBeNull();
  });

  it("shows upload status, clears completed, and allows removal", () => {
    const uploads = new Map([
      [
        "a",
        {
          id: "a",
          name: "file-a.txt",
          size: 100,
          progress: 25,
          status: "uploading" as const,
        },
      ],
      [
        "b",
        {
          id: "b",
          name: "file-b.txt",
          size: 200,
          progress: 100,
          status: "completed" as const,
        },
      ],
    ]);

    useUploadStore.setState({ uploads });

    const { container } = render(<UploadProgress />);

    expect(screen.getByText("Uploading 1 file")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(useUploadStore.getState().uploads.has("b")).toBe(false);

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(useUploadStore.getState().uploads.has("a")).toBe(false);
  });

  it("collapses to a summary progress bar", () => {
    const uploads = new Map([
      [
        "a",
        {
          id: "a",
          name: "file-a.txt",
          size: 100,
          progress: 25,
          status: "uploading" as const,
        },
      ],
    ]);

    useUploadStore.setState({ uploads });

    render(<UploadProgress />);

    fireEvent.click(screen.getByText("Uploading 1 file"));

    expect(screen.queryByText("file-a.txt")).toBeNull();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });
});
