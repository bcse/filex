import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "-";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatResolutions(width?: number, height?: number): string {
  if (!width || !height) return "-";
  return `${width}×${height}`;
}

export function getFileIcon(mimeType?: string, isDir?: boolean): string {
  if (isDir) return "folder";
  if (!mimeType) return "file";

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "music";
  if (mimeType.startsWith("text/")) return "file-text";
  if (mimeType.includes("pdf")) return "file-text";
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return "archive";
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript")
  )
    return "file-code";

  return "file";
}

export function getParentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

export function joinPath(...parts: string[]): string {
  return (
    "/" +
    parts
      .map((p) => p.replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/")
  );
}

export function buildEntryPath(
  name: string,
  path: string | undefined,
  parentPath: string,
): string {
  const normalizedPath = path
    ? path.replace(/\/+/g, "/").replace(/\/$/, "")
    : "";
  const pathBaseName = normalizedPath.split("/").filter(Boolean).pop();
  const pathLooksValid = Boolean(
    pathBaseName && pathBaseName !== "." && pathBaseName === name,
  );
  const basePath = pathLooksValid
    ? path!
    : `${parentPath === "/" ? "" : parentPath}/${name}`;
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+/g, "/");
}
