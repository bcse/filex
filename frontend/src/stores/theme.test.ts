import { describe, expect, it, vi } from "vitest";

const setupThemeStore = async (
  savedTheme?: string,
  matches = false,
): Promise<{
  useThemeStore: typeof import("./theme").useThemeStore;
  getSystemTheme: typeof import("./theme").getSystemTheme;
  getEffectiveTheme: typeof import("./theme").getEffectiveTheme;
  mql: MutableMediaQueryList;
  listeners: Array<(event: MediaQueryListEvent) => void>;
}> => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.className = "";
  if (savedTheme) {
    localStorage.setItem("theme", savedTheme);
  }

  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const mql: MutableMediaQueryList = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_, listener) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql as MediaQueryList),
  );

  const mod = await import("./theme");
  return { ...mod, mql, listeners };
};

type MutableMediaQueryList = Omit<MediaQueryList, "matches"> & {
  matches: boolean;
};

describe("theme store", () => {
  it("initializes from localStorage and applies the class", async () => {
    const { useThemeStore } = await setupThemeStore("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists theme updates to localStorage", async () => {
    const { useThemeStore } = await setupThemeStore("light");
    useThemeStore.getState().setTheme("dark");

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("uses system theme and reacts to media changes", async () => {
    const { useThemeStore, listeners, mql } = await setupThemeStore("system");
    expect(useThemeStore.getState().theme).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    mql.matches = true;
    listeners.forEach((listener) =>
      listener({ matches: true } as MediaQueryListEvent),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("returns effective theme values", async () => {
    const { getEffectiveTheme, getSystemTheme } = await setupThemeStore(
      undefined,
      true,
    );

    expect(getSystemTheme()).toBe("dark");
    expect(getEffectiveTheme("system")).toBe("dark");
    expect(getEffectiveTheme("light")).toBe("light");
  });
});
