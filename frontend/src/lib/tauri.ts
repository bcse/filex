import { isTauri } from "@/lib/config";
import { toast } from "sonner";

export const isMacOS = (): boolean =>
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent);

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

export const quickLook = async (paths: string[]): Promise<boolean> => {
  if (!isTauri() || paths.length === 0) {
    return false;
  }

  const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("quick_look", { paths });
  } catch (error) {
    toast.error(`Unable to open Quick Look (${formatError(error)})`);
    return false;
  }
};

export const quickLookRefresh = async (
  paths: string[] | null,
): Promise<boolean> => {
  if (!isTauri()) {
    return false;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("quick_look_refresh", { paths });
  } catch {
    return false;
  }
};

export const quickLookClose = async (): Promise<void> => {
  if (!isTauri()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("quick_look_close");
  } catch {
    // Ignore errors
  }
};

export const quickLookIsVisible = async (): Promise<boolean> => {
  if (!isTauri()) {
    return false;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("quick_look_is_visible");
  } catch {
    return false;
  }
};
