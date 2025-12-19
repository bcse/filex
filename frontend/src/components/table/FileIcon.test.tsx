import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FileIcon } from "./FileIcon";
import type { FileEntry } from "@/types/file";

function getIconClass(entry: FileEntry): string | null {
  const { container } = render(<FileIcon entry={entry} />);
  const svg = container.querySelector("svg");
  return svg?.getAttribute("class") ?? null;
}

describe("FileIcon", () => {
  it("renders a folder icon for directories", () => {
    const icon = getIconClass({
      name: "Photos",
      path: "/Photos",
      is_dir: true,
    });

    expect(icon).toContain("text-yellow-500");
  });

  it("renders media icons by mime type", () => {
    expect(
      getIconClass({
        name: "pic.png",
        path: "/pic.png",
        is_dir: false,
        mime_type: "image/png",
      }),
    ).toContain("text-green-500");

    expect(
      getIconClass({
        name: "movie.mp4",
        path: "/movie.mp4",
        is_dir: false,
        mime_type: "video/mp4",
      }),
    ).toContain("text-purple-500");

    expect(
      getIconClass({
        name: "song.mp3",
        path: "/song.mp3",
        is_dir: false,
        mime_type: "audio/mpeg",
      }),
    ).toContain("text-pink-500");
  });

  it("renders document and archive icons", () => {
    expect(
      getIconClass({
        name: "readme.txt",
        path: "/readme.txt",
        is_dir: false,
        mime_type: "text/plain",
      }),
    ).toContain("text-red-500");

    expect(
      getIconClass({
        name: "report.pdf",
        path: "/report.pdf",
        is_dir: false,
        mime_type: "application/pdf",
      }),
    ).toContain("text-red-500");

    expect(
      getIconClass({
        name: "archive.zip",
        path: "/archive.zip",
        is_dir: false,
        mime_type: "application/zip",
      }),
    ).toContain("text-orange-500");
  });

  it("renders code icon for known code mimes", () => {
    expect(
      getIconClass({
        name: "data.json",
        path: "/data.json",
        is_dir: false,
        mime_type: "application/json",
      }),
    ).toContain("text-blue-500");
  });

  it("falls back to a generic file icon", () => {
    expect(
      getIconClass({
        name: "blob.bin",
        path: "/blob.bin",
        is_dir: false,
        mime_type: "application/octet-stream",
      }),
    ).toContain("text-gray-500");
  });
});
