import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/api/client";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const navigationStore = vi.hoisted(() => ({
  state: {
    currentPath: "/",
    selectedFiles: new Set<string>(),
    clearSelection: vi.fn(),
    viewMode: "table" as const,
    setViewMode: vi.fn(),
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  useCreateDirectory: vi.fn(),
  useDelete: vi.fn(),
  useRename: vi.fn(),
  useUploadWithProgress: vi.fn(),
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: () => navigationStore.state,
}));

vi.mock("@/hooks/useDirectory", () => ({
  useCreateDirectory: () => mocks.useCreateDirectory(),
  useDelete: () => mocks.useDelete(),
  useRename: () => mocks.useRename(),
  useUploadWithProgress: () => mocks.useUploadWithProgress(),
}));

import { Toolbar } from "./Toolbar";

let createDirectoryMock: {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
};
let deleteMock: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
let renameMock: { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
let uploadFilesMock: ReturnType<typeof vi.fn>;

describe("Toolbar", () => {
  beforeEach(() => {
    navigationStore.state = {
      currentPath: "/",
      selectedFiles: new Set<string>(),
      clearSelection: vi.fn(),
      viewMode: "table",
      setViewMode: vi.fn(),
      deleteConfirmOpen: false,
      setDeleteConfirmOpen: vi.fn(),
    };

    createDirectoryMock = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };
    mocks.useCreateDirectory.mockReturnValue(createDirectoryMock);
    deleteMock = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };
    renameMock = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };
    uploadFilesMock = vi.fn().mockResolvedValue(undefined);
    mocks.useDelete.mockReturnValue(deleteMock);
    mocks.useRename.mockReturnValue(renameMock);
    mocks.useUploadWithProgress.mockReturnValue({
      uploadFiles: uploadFilesMock,
    });
  });

  it("creates a new folder in the current path", async () => {
    const user = userEvent.setup();

    render(<Toolbar />);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.click(await screen.findByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createDirectoryMock.mutateAsync).toHaveBeenCalledWith(
        "/New Folder",
      );
    });
  });

  it("toggles the view mode", async () => {
    const user = userEvent.setup();

    render(<Toolbar />);

    await user.click(screen.getByTitle("Switch to grid view"));

    expect(navigationStore.state.setViewMode).toHaveBeenCalledWith("grid");
  });

  it("renames the selected item and clears selection", async () => {
    const user = userEvent.setup();
    navigationStore.state.selectedFiles = new Set(["/Docs/report.txt"]);

    render(<Toolbar />);

    await user.click(screen.getByRole("button", { name: "Rename" }));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByPlaceholderText("New name");
    await user.clear(input);
    await user.type(input, "renamed.txt");
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(renameMock.mutateAsync).toHaveBeenCalledWith({
        path: "/Docs/report.txt",
        newName: "renamed.txt",
      });
    });
    expect(navigationStore.state.clearSelection).toHaveBeenCalled();
  });

  it("opens the delete confirmation when selection exists", async () => {
    const user = userEvent.setup();
    navigationStore.state.selectedFiles = new Set(["/Docs/report.txt"]);

    render(<Toolbar />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(navigationStore.state.setDeleteConfirmOpen).toHaveBeenCalledWith(
      true,
    );
  });

  it("deletes each selected item after confirmation", async () => {
    const user = userEvent.setup();
    navigationStore.state.selectedFiles = new Set([
      "/Docs/report.txt",
      "/Docs/notes.txt",
    ]);
    navigationStore.state.deleteConfirmOpen = true;

    render(<Toolbar />);

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteMock.mutateAsync).toHaveBeenCalledTimes(2);
    });
    expect(deleteMock.mutateAsync).toHaveBeenNthCalledWith(1, {
      path: "/Docs/report.txt",
      suppressToast: true,
    });
    expect(deleteMock.mutateAsync).toHaveBeenNthCalledWith(2, {
      path: "/Docs/notes.txt",
      suppressToast: true,
    });
    expect(navigationStore.state.clearSelection).toHaveBeenCalled();
    expect(navigationStore.state.setDeleteConfirmOpen).toHaveBeenCalledWith(
      false,
    );
  });

  it("downloads all selected files", async () => {
    const user = userEvent.setup();
    navigationStore.state.selectedFiles = new Set([
      "/Docs/report.txt",
      "/Docs/notes.txt",
    ]);
    const downloadSpy = vi.spyOn(api, "getDownloadUrl");

    render(<Toolbar />);

    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(downloadSpy).toHaveBeenCalledWith("/Docs/report.txt");
    expect(downloadSpy).toHaveBeenCalledWith("/Docs/notes.txt");
  });

  it("uploads files from the file input", async () => {
    const user = userEvent.setup();
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    const { container } = render(<Toolbar />);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalled();
    });
    const [path, files] = uploadFilesMock.mock.calls[0];
    expect(path).toBe("/");
    expect(files.length).toBe(1);
    expect(files[0]?.name).toBe("notes.txt");
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });
});
