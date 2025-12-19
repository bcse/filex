import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";

const navigationStore = vi.hoisted(() => ({
  state: {
    sidebarWidth: 250,
    setSidebarWidth: vi.fn(),
  },
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => navigationStore.state,
}));

vi.mock("@/components/tree/DirectoryTree", () => ({
  DirectoryTree: () => <div>DirectoryTree</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { Sidebar } from "./Sidebar";

let setItemSpy: ReturnType<typeof vi.spyOn>;

describe("Sidebar", () => {
  beforeEach(() => {
    navigationStore.state = {
      sidebarWidth: 250,
      setSidebarWidth: vi.fn(),
    };
    localStorage.clear();
    setItemSpy = vi.spyOn(localStorage, "setItem");
    setItemSpy.mockClear();
  });

  it("restores sidebar width from localStorage", () => {
    localStorage.setItem("sidebarWidth", "300");

    render(<Sidebar />);

    expect(navigationStore.state.setSidebarWidth).toHaveBeenCalledWith(300);
  });

  it("clamps resize events and persists on mouseup", () => {
    const { container } = render(<Sidebar />);
    const handle = container.querySelector(".cursor-col-resize");
    expect(handle).not.toBeNull();

    navigationStore.state.setSidebarWidth.mockClear();

    fireEvent.mouseDown(handle as Element, { clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(navigationStore.state.setSidebarWidth).toHaveBeenLastCalledWith(150);

    fireEvent.mouseMove(window, { clientX: 600 });
    expect(navigationStore.state.setSidebarWidth).toHaveBeenLastCalledWith(500);

    fireEvent.mouseUp(window);
    expect(setItemSpy).toHaveBeenCalledWith("sidebarWidth", "250");
  });
});
