import { describe, it, expect, vi, beforeEach } from "vitest";
import { performDropAction } from "./dropActions";
import type { DropAction, DropPromptState } from "./DropPrompt";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("performDropAction", () => {
  const move = { mutateAsync: vi.fn() };
  const copy = { mutateAsync: vi.fn() };
  const clearSelection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when dropPrompt is null", async () => {
    const action: DropAction = { operation: "copy", strategy: "skip" };

    await performDropAction({
      action,
      dropPrompt: null,
      move,
      copy,
      clearSelection,
    });

    expect(move.mutateAsync).not.toHaveBeenCalled();
    expect(copy.mutateAsync).not.toHaveBeenCalled();
  });

  it("moves items with overwrite and summarizes results", async () => {
    move.mutateAsync.mockResolvedValueOnce({ performed: true });
    move.mutateAsync.mockResolvedValueOnce({ performed: false });

    const dropPrompt: DropPromptState = {
      paths: ["/a.txt", "/b.txt"],
      targetPath: "/dest",
      x: 0,
      y: 0,
    };

    await performDropAction({
      action: { operation: "move", strategy: "overwrite" },
      dropPrompt,
      move,
      copy,
      clearSelection,
    });

    expect(move.mutateAsync).toHaveBeenCalledWith({
      from: "/a.txt",
      to: "/dest/a.txt",
      overwrite: true,
      suppressToast: true,
    });
    expect(move.mutateAsync).toHaveBeenCalledWith({
      from: "/b.txt",
      to: "/dest/b.txt",
      overwrite: true,
      suppressToast: true,
    });
    expect(clearSelection).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Moved 1 of 2 items (skipped 1)",
    );
  });

  it("prevents moving into itself", async () => {
    const dropPrompt: DropPromptState = {
      paths: ["/folder"],
      targetPath: "/folder",
      x: 0,
      y: 0,
    };

    await performDropAction({
      action: { operation: "move", strategy: "skip" },
      dropPrompt,
      move,
      copy,
      clearSelection,
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Cannot move "folder" into itself',
    );
    expect(move.mutateAsync).not.toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
  });

  it("copies items without overwrite", async () => {
    copy.mutateAsync.mockResolvedValueOnce({ performed: true });

    const dropPrompt: DropPromptState = {
      paths: ["/a.txt"],
      targetPath: "/dest",
      x: 0,
      y: 0,
    };

    await performDropAction({
      action: { operation: "copy", strategy: "skip" },
      dropPrompt,
      move,
      copy,
      clearSelection,
    });

    expect(copy.mutateAsync).toHaveBeenCalledWith({
      from: "/a.txt",
      to: "/dest/a.txt",
      overwrite: false,
      suppressToast: true,
    });
    expect(toast.success).toHaveBeenCalledWith("Copied 1 of 1 items");
  });

  it("skips when from and to are identical", async () => {
    const dropPrompt: DropPromptState = {
      paths: ["/a.txt"],
      targetPath: "/",
      x: 0,
      y: 0,
    };

    await performDropAction({
      action: { operation: "move", strategy: "overwrite" },
      dropPrompt,
      move,
      copy,
      clearSelection,
    });

    expect(move.mutateAsync).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
