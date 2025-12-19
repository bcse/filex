import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const navigationStore = vi.hoisted(() => ({
  state: {
    searchQuery: "",
    setSearchQuery: vi.fn(),
    setIsSearching: vi.fn(),
    setCurrentPath: vi.fn(),
    currentPath: "/",
    setSearchOffset: vi.fn(),
  },
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => navigationStore.state,
}));

import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    navigationStore.state = {
      searchQuery: "",
      setSearchQuery: vi.fn(),
      setIsSearching: vi.fn(),
      setCurrentPath: vi.fn(),
      currentPath: "/docs",
      setSearchOffset: vi.fn(),
    };
  });

  it("updates search state as the user types", () => {
    render(<SearchBar />);

    fireEvent.change(screen.getByPlaceholderText("Search files..."), {
      target: { value: "ab" },
    });

    expect(navigationStore.state.setSearchOffset).toHaveBeenCalledWith(0, {
      recordHistory: false,
    });
    expect(navigationStore.state.setSearchQuery).toHaveBeenCalledWith("ab");
    expect(navigationStore.state.setIsSearching).toHaveBeenCalledWith(true);
  });

  it("clears the query and refocuses the input", () => {
    navigationStore.state.searchQuery = "abc";

    render(<SearchBar />);

    const input = screen.getByPlaceholderText("Search files...");
    const clearButton = screen.getByRole("button");

    fireEvent.click(clearButton);

    expect(navigationStore.state.setSearchQuery).toHaveBeenCalledWith("", {
      recordHistory: false,
    });
    expect(navigationStore.state.setIsSearching).toHaveBeenCalledWith(false);
    expect(navigationStore.state.setCurrentPath).toHaveBeenCalledWith("/docs", {
      exitSearch: true,
    });
    expect(navigationStore.state.setSearchOffset).toHaveBeenCalledWith(0, {
      recordHistory: false,
    });
    expect(input).toHaveFocus();
  });
});
