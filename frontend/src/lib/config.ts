/**
 * Tauri detection and server URL configuration
 */

const CONFIG_KEY = "filex-server-url";
let cachedApiBase: string | null = null;

/**
 * Check if running in Tauri desktop environment
 * Tauri v2 uses __TAURI_INTERNALS__ instead of __TAURI__
 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

/**
 * Get the API base URL
 * - In web mode: returns "/api" (relative path, proxied by Vite or served by backend)
 * - In Tauri mode: returns configured server URL or default localhost
 */
export const getApiBase = (): string => {
  if (cachedApiBase !== null) {
    return cachedApiBase;
  }

  // In web mode, always use relative path
  if (!isTauri()) {
    cachedApiBase = "/api";
    return cachedApiBase;
  }

  // In Tauri mode, check localStorage for configured server
  const stored = localStorage.getItem(CONFIG_KEY);
  if (stored) {
    cachedApiBase = stored;
    return cachedApiBase;
  }

  // Default fallback for Tauri
  cachedApiBase = "http://localhost:3000/api";
  return cachedApiBase;
};

/**
 * Set the server URL (Tauri mode only)
 * Normalizes the URL to ensure it ends with /api
 */
export const setServerUrl = (url: string): void => {
  const base = url.replace(/\/+$/, ""); // Remove trailing slashes
  const apiBase = base.endsWith("/api") ? base : `${base}/api`;
  localStorage.setItem(CONFIG_KEY, apiBase);
  cachedApiBase = apiBase;
};

/**
 * Get the stored server URL (without /api suffix)
 */
export const getServerUrl = (): string | null => {
  const stored = localStorage.getItem(CONFIG_KEY);
  if (!stored) return null;
  // Remove /api suffix if present
  return stored.replace(/\/api$/, "");
};

/**
 * Check if a server URL has been configured
 */
export const hasServerConfig = (): boolean => {
  return localStorage.getItem(CONFIG_KEY) !== null;
};

/**
 * Clear the server URL configuration
 */
export const clearServerUrl = (): void => {
  localStorage.removeItem(CONFIG_KEY);
  cachedApiBase = null;
};

/**
 * Reset the cached API base (useful after config changes)
 */
export const resetApiBaseCache = (): void => {
  cachedApiBase = null;
};
