/**
 * API configuration for web mode
 */

/**
 * Get the API base URL
 * Returns "/api" (relative path, proxied by Vite or served by backend)
 */
export const getApiBase = (): string => {
  return "/api";
};
