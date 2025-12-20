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

export const isPreviewableFile = (entry: Pick<FileEntry, "is_dir" | "name">) =>
  isImageFile(entry) || isVideoFile(entry);
