import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectoryTree } from "./DirectoryTree";
import { useTree, useMove, useCopy } from "@/hooks/useDirectory";
import { useNavigationStore } from "@/stores/navigation";
import { performDropAction } from "@/components/dnd/dropActions";
import type { TreeNode } from "@/types/file";

vi.mock("@/hooks/useDirectory", () => ({
  useTree: vi.fn(),
  useMove: vi.fn(),
  useCopy: vi.fn(),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: vi.fn(),
}));

vi.mock("@/components/dnd/dropActions", () => ({
  performDropAction: vi.fn(),
}));

const mockedUseTree = vi.mocked(useTree);
const mockedUseMove = vi.mocked(useMove);
const mockedUseCopy = vi.mocked(useCopy);
const mockedUseNavigationStore = vi.mocked(useNavigationStore);
const mockedPerformDropAction = vi.mocked(performDropAction);

const createDataTransfer = () => {
  const store: Record<string, string> = {};
  return {
    data: store,
    types: ["application/x-file-paths"],
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseNavigationStore.mockReturnValue({
    currentPath: "/",
    setCurrentPath: vi.fn(),
    clearSelection: vi.fn(),
  } as ReturnType<typeof useNavigationStore>);
  mockedUseMove.mockReturnValue({ mutateAsync: vi.fn() } as never);
  mockedUseCopy.mockReturnValue({ mutateAsync: vi.fn() } as never);
});

describe("DirectoryTree", () => {
  it("renders a loading spinner while fetching", () => {
    mockedUseTree.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);

    render(<DirectoryTree />);

    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders root nodes and navigates on click", async () => {
    const user = userEvent.setup();
    const nodes: TreeNode[] = [
      { name: "Projects", path: "/Projects", has_children: false },
    ];
    mockedUseTree.mockImplementation((path: string) => {
      if (path === "/") {
        return { data: nodes, isLoading: false } as never;
      }
      return { data: [], isLoading: false } as never;
    });

    render(<DirectoryTree />);

    const item = await screen.findByText("Projects");
    await user.click(item);

    const store = mockedUseNavigationStore.mock.results[0].value;
    expect(store.setCurrentPath).toHaveBeenCalledWith("/Projects", {
      exitSearch: true,
    });
  });

  it("opens drop prompt when dropping on root", async () => {
    mockedUseTree.mockReturnValue({ data: [], isLoading: false } as never);

    render(<DirectoryTree />);

    const rootRow = screen.getByText("Root").parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();
    dataTransfer.setData(
      "application/x-file-paths",
      JSON.stringify(["/a.txt"]),
    );

    fireEvent.drop(rootRow, {
      dataTransfer,
      clientX: 12,
      clientY: 34,
    });

    expect(await screen.findByText("Copy & Overwrite")).toBeInTheDocument();
  });

  it("performs drop action and closes prompt", async () => {
    const user = userEvent.setup();
    mockedUseTree.mockReturnValue({ data: [], isLoading: false } as never);

    render(<DirectoryTree />);

    const rootRow = screen.getByText("Root").parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();
    dataTransfer.setData(
      "application/x-file-paths",
      JSON.stringify(["/a.txt"]),
    );

    fireEvent.drop(rootRow, {
      dataTransfer,
      clientX: 12,
      clientY: 34,
    });

    await user.click(await screen.findByText("Copy & Overwrite"));

    await waitFor(() => {
      expect(mockedPerformDropAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: { operation: "copy", strategy: "overwrite" },
          dropPrompt: expect.objectContaining({
            paths: ["/a.txt"],
            targetPath: "/",
          }),
        }),
      );
    });

    expect(screen.queryByText("Copy & Overwrite")).toBeNull();
  });

  it("auto-expands to reveal the current path", async () => {
    mockedUseNavigationStore.mockReturnValue({
      currentPath: "/Projects/Sub",
      setCurrentPath: vi.fn(),
      clearSelection: vi.fn(),
    } as ReturnType<typeof useNavigationStore>);
    mockedUseTree.mockImplementation((path: string) => {
      if (path === "/") {
        return {
          data: [{ name: "Projects", path: "/Projects", has_children: true }],
          isLoading: false,
        } as never;
      }
      if (path === "/Projects") {
        return {
          data: [{ name: "Sub", path: "/Projects/Sub", has_children: false }],
          isLoading: false,
        } as never;
      }
      return { data: [], isLoading: false } as never;
    });

    render(<DirectoryTree />);

    expect(await screen.findByText("Sub")).toBeInTheDocument();
  });

  it("keeps a user-collapsed node closed even when current path is inside", async () => {
    const user = userEvent.setup();
    mockedUseNavigationStore.mockReturnValue({
      currentPath: "/Projects/Sub",
      setCurrentPath: vi.fn(),
      clearSelection: vi.fn(),
    } as ReturnType<typeof useNavigationStore>);
    mockedUseTree.mockImplementation((path: string) => {
      if (path === "/") {
        return {
          data: [{ name: "Projects", path: "/Projects", has_children: true }],
          isLoading: false,
        } as never;
      }
      if (path === "/Projects") {
        return {
          data: [{ name: "Sub", path: "/Projects/Sub", has_children: false }],
          isLoading: false,
        } as never;
      }
      return { data: [], isLoading: false } as never;
    });

    render(<DirectoryTree />);

    const projectsItem = await screen.findByText("Projects");
    const projectsRow = projectsItem.parentElement as HTMLElement;
    const toggle = projectsRow.querySelector("span") as HTMLElement;
    await user.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText("Sub")).toBeNull();
    });
  });

  it("opens drop prompt when dropping on a child node", async () => {
    mockedUseTree.mockImplementation((path: string) => {
      if (path === "/") {
        return {
          data: [{ name: "Projects", path: "/Projects", has_children: false }],
          isLoading: false,
        } as never;
      }
      return { data: [], isLoading: false } as never;
    });

    render(<DirectoryTree />);

    const item = await screen.findByText("Projects");
    const row = item.parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();
    dataTransfer.setData(
      "application/x-file-paths",
      JSON.stringify(["/a.txt"]),
    );

    fireEvent.drop(row, {
      dataTransfer,
      clientX: 10,
      clientY: 20,
    });

    expect(await screen.findByText("Copy & Overwrite")).toBeInTheDocument();
  });

  it("does not open drop prompt when dropping root onto root", () => {
    mockedUseTree.mockReturnValue({ data: [], isLoading: false } as never);

    render(<DirectoryTree />);

    const rootRow = screen.getByText("Root").parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();
    dataTransfer.setData("application/x-file-paths", JSON.stringify(["/"]));

    fireEvent.drop(rootRow, {
      dataTransfer,
      clientX: 12,
      clientY: 34,
    });

    expect(screen.queryByText("Copy & Overwrite")).toBeNull();
  });

  it("blocks dropping a folder onto its own descendant", async () => {
    const user = userEvent.setup();
    mockedUseTree.mockImplementation((path: string) => {
      if (path === "/") {
        return {
          data: [{ name: "Projects", path: "/Projects", has_children: true }],
          isLoading: false,
        } as never;
      }
      if (path === "/Projects") {
        return {
          data: [{ name: "Sub", path: "/Projects/Sub", has_children: false }],
          isLoading: false,
        } as never;
      }
      return { data: [], isLoading: false } as never;
    });

    render(<DirectoryTree />);

    const projectsItem = await screen.findByText("Projects");
    const projectsRow = projectsItem.parentElement as HTMLElement;
    const toggle = projectsRow.querySelector("span") as HTMLElement;
    await user.click(toggle);

    const subItem = await screen.findByText("Sub");
    const subRow = subItem.parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();
    dataTransfer.setData(
      "application/x-file-paths",
      JSON.stringify(["/Projects"]),
    );

    fireEvent.drop(subRow, {
      dataTransfer,
      clientX: 12,
      clientY: 34,
    });

    expect(screen.queryByText("Copy & Overwrite")).toBeNull();
  });
});
