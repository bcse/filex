import { isTauri } from "@/lib/config";
import { toast } from "sonner";

export const openLocalPath = async (
  path: string,
  fallbackUrl?: string,
): Promise<boolean> => {
  if (!isTauri()) {
    if (fallbackUrl) {
      window.open(fallbackUrl, "_blank");
    }
    return false;
  }

  const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    const fileUrl = path.startsWith("file://")
      ? path
      : `file://${path.startsWith("/") ? "" : "/"}${encodeURI(path)}`;
    try {
      await open(fileUrl);
      return true;
    } catch (error) {
      try {
        await open(path);
        return true;
      } catch (secondError) {
        const message = formatError(secondError || error);
        toast.error(`Unable to open local file: ${path} (${message})`);
        return false;
      }
    }
  } catch (error) {
    toast.error(`Unable to open local file: ${path} (${formatError(error)})`);
    return false;
  }
};
