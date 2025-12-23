export const toSafeHttpUrl = (
  url: string,
  base: string = window.location.origin,
): string | null => {
  try {
    const parsed = new URL(url, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};
