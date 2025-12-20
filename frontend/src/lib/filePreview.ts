import type { FileEntry } from "@/types/file";

const imageExtensions = new Set([
  "png",
  "apng",
  "jpg",
  "jpeg",
  "jpe",
  "jif",
  "jfif",
  "jfi",
  "gif",
  "bmp",
  "webp",
  "avif",
  "svg",
]);

const videoExtensions = new Set([
  "mp4",
  "m4a",
  "m4p",
  "m4b",
  "m4r",
  "m4v",
  "mov",
  "movie",
  "qt",
  "webm",
  "mkv",
  "mk3d",
  "mka",
  "mks",
  "ogv",
  "ogg",
  "ogm",
]);

const textExtensions = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "csv",
  "tsv",
  "log",
  "ini",
  "toml",
  "env",
  "conf",
  "config",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "xml",
  "svg",
]);

const getExtension = (name: string): string => {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const hasExtension = (name: string, extensions: Set<string>) =>
  extensions.has(getExtension(name));

export const isImageFile = (entry: Pick<FileEntry, "is_dir" | "name">) => {
  if (entry.is_dir) return false;
  return hasExtension(entry.name, imageExtensions);
};

export const isVideoFile = (entry: Pick<FileEntry, "is_dir" | "name">) => {
  if (entry.is_dir) return false;
  return hasExtension(entry.name, videoExtensions);
};

export const isTextFile = (entry: Pick<FileEntry, "is_dir" | "name">) => {
  if (entry.is_dir) return false;
  return hasExtension(entry.name, textExtensions);
};

export const isPreviewableFile = (entry: Pick<FileEntry, "is_dir" | "name">) =>
  isImageFile(entry) || isVideoFile(entry) || isTextFile(entry);
