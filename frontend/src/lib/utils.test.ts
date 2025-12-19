import { describe, expect, it } from "vitest";
import {
  buildEntryPath,
  formatDimensions,
  formatDuration,
  formatFileSize,
  getFileIcon,
  getParentPath,
  joinPath,
} from "./utils";

describe("utils", () => {
  it("formats file sizes", () => {
    expect(formatFileSize()).toBe("-");
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats durations", () => {
    expect(formatDuration()).toBe("-");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("formats dimensions", () => {
    expect(formatDimensions()).toBe("-");
    expect(formatDimensions(0, 100)).toBe("-");
    expect(formatDimensions(1920, 1080)).toBe("1920×1080");
  });

  it("maps file icons", () => {
    expect(getFileIcon(undefined, true)).toBe("folder");
    expect(getFileIcon("image/png", false)).toBe("image");
    expect(getFileIcon("video/mp4", false)).toBe("video");
    expect(getFileIcon("audio/mpeg", false)).toBe("music");
    expect(getFileIcon("text/plain", false)).toBe("file-text");
    expect(getFileIcon("application/pdf", false)).toBe("file-text");
    expect(getFileIcon("application/zip", false)).toBe("archive");
    expect(getFileIcon("application/json", false)).toBe("file-code");
    expect(getFileIcon("application/octet-stream", false)).toBe("file");
  });

  it("builds parent and joined paths", () => {
    expect(getParentPath("/")).toBe("/");
    expect(getParentPath("/foo")).toBe("/");
    expect(getParentPath("/foo/bar")).toBe("/foo");

    expect(joinPath("/foo/", "/bar", "baz/")).toBe("/foo/bar/baz");
    expect(joinPath("", "/foo", "", "bar")).toBe("/foo/bar");
  });

  it("builds entry paths", () => {
    expect(buildEntryPath("bar", "/foo/bar", "/foo")).toBe("/foo/bar");
    expect(buildEntryPath("bar", "/foo/bar/", "/foo")).toBe("/foo/bar/");
    expect(buildEntryPath("baz", undefined, "/")).toBe("/baz");
    expect(buildEntryPath("baz", "baz", "/")).toBe("/baz");
  });
});
