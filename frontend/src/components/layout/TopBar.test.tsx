import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const navigationStore = vi.hoisted(() => ({
  state: {
    currentPath: "/",
    setCurrentPath: vi.fn(),
    isSearching: false,
    searchQuery: "",
    history: [{ type: "path", path: "/", offset: 0 }],
    historyIndex: 0,
    goBack: vi.fn(),
    goForward: vi.fn(),
  },
}));

const authStore = vi.hoisted(() => ({
  state: {
    authRequired: false,
    logout: null as null | (() => void),
  },
}));

const themeStore = vi.hoisted(() => ({
  state: {
    theme: "light" as const,
    setTheme: vi.fn(),
  },
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => navigationStore.state,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => authStore.state,
}));

vi.mock("@/stores/theme", () => ({
  useThemeStore: () => themeStore.state,
  getEffectiveTheme: (theme: "light" | "dark" | "system") =>
    theme === "system" ? "light" : theme,
}));

vi.mock("./SearchBar", () => ({
  SearchBar: () => <div>SearchBar</div>,
}));

vi.mock("./Toolbar", () => ({
  Toolbar: () => <div>Toolbar</div>,
}));

vi.mock("./IndexerStatus", () => ({
  IndexerStatus: () => <div>IndexerStatus</div>,
}));

vi.mock("@/components/auth/UserMenu", () => ({
  UserMenu: ({ onLogout }: { onLogout: () => void }) => (
    <button onClick={onLogout}>UserMenu</button>
  ),
}));

import { TopBar } from "./TopBar";

describe("TopBar", () => {
  beforeEach(() => {
    navigationStore.state = {
      currentPath: "/",
      setCurrentPath: vi.fn(),
      isSearching: false,
      searchQuery: "",
      history: [{ type: "path", path: "/", offset: 0 }],
      historyIndex: 0,
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    authStore.state = {
      authRequired: false,
      logout: null,
    };
    themeStore.state = {
      theme: "light",
      setTheme: vi.fn(),
    };
  });

  it("renders breadcrumb segments and navigates", () => {
    navigationStore.state.currentPath = "/foo/bar";

    render(<TopBar />);

    fireEvent.click(screen.getByRole("button", { name: "foo" }));

    expect(navigationStore.state.setCurrentPath).toHaveBeenCalledWith("/foo");
  });

  it("shows search results label when searching", () => {
    navigationStore.state.isSearching = true;
    navigationStore.state.searchQuery = "hi";

    render(<TopBar />);

    expect(screen.getByText(/Search results/)).toBeInTheDocument();
  });

  it("toggles theme from the theme button", () => {
    render(<TopBar />);

    fireEvent.click(screen.getByTitle("Theme: light"));

    expect(themeStore.state.setTheme).toHaveBeenCalledWith("dark");
  });
});
