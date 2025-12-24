import { isTauri } from "@/lib/config";
import { toast } from "sonner";

export const isMacOS = (): boolean =>
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent);

type OpenLocalPathResult =
  | { opened: true }
  | { opened: false; reason: "missing" | "error" | "not-tauri" };

export const openLocalPath = async (
  path: string,
  fallbackUrl?: string,
  options: { suppressMissingToast?: boolean } = {},
): Promise<OpenLocalPathResult> => {
  if (!isTauri()) {
    if (fallbackUrl) {
      window.open(fallbackUrl, "_blank");
    }
    return { opened: false, reason: "not-tauri" };
  }

  const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  const pathForCheck = path.startsWith("file://")
    ? decodeURI(path.replace(/^file:\/\//, ""))
    : path;
  const formatOpenFailure = (error: unknown) => {
    const message = formatError(error);
    const normalized = message.toLowerCase();
    if (
      normalized.includes("no such file") ||
      normalized.includes("not found") ||
      normalized.includes("does not exist")
    ) {
      return `Local path not found: ${path}`;
    }
    return `Unable to open local file: ${path} (${message})`;
  };

  try {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const exists = await invoke<boolean>("local_path_exists", {
        path: pathForCheck,
      });
      if (!exists) {
        if (!options.suppressMissingToast) {
          toast.error(`Local path not found: ${pathForCheck}`);
        }
        return { opened: false, reason: "missing" };
      }
    } catch {
      // If the check fails, proceed to try opening the path.
    }
    const { open } = await import("@tauri-apps/plugin-shell");
    const fileUrl = path.startsWith("file://")
      ? path
      : `file://${path.startsWith("/") ? "" : "/"}${encodeURI(path)}`;
    try {
      await open(fileUrl);
      return { opened: true };
    } catch (error) {
      try {
        await open(path);
        return { opened: true };
      } catch (secondError) {
        toast.error(formatOpenFailure(secondError || error));
        return { opened: false, reason: "error" };
      }
    }
  } catch (error) {
    toast.error(formatOpenFailure(error));
    return { opened: false, reason: "error" };
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
