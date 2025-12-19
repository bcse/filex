import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropPrompt } from "./DropPrompt";

describe("DropPrompt", () => {
  it("returns null when no prompt", () => {
    const { container } = render(
      <DropPrompt dropPrompt={null} onClose={vi.fn()} onAction={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("positions the menu and triggers actions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAction = vi.fn();

    render(
      <DropPrompt
        dropPrompt={{ paths: ["/a"], targetPath: "/", x: 10, y: 20 }}
        onClose={onClose}
        onAction={onAction}
      />,
    );

    const prompt = screen.getByText("Copy & Overwrite").closest("div");
    expect(prompt).toHaveStyle({ left: "10px", top: "20px" });

    await user.click(screen.getByText("Copy & Overwrite"));
    expect(onAction).toHaveBeenCalledWith({
      operation: "copy",
      strategy: "overwrite",
    });
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByText("Move & Skip"));
    expect(onAction).toHaveBeenCalledWith({
      operation: "move",
      strategy: "skip",
    });
  });

  it("closes when clicking overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { container } = render(
      <DropPrompt
        dropPrompt={{ paths: ["/a"], targetPath: "/", x: 0, y: 0 }}
        onClose={onClose}
        onAction={vi.fn()}
      />,
    );

    const overlay = container.firstChild as HTMLElement;
    await user.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the menu", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DropPrompt
        dropPrompt={{ paths: ["/a"], targetPath: "/", x: 0, y: 0 }}
        onClose={onClose}
        onAction={vi.fn()}
      />,
    );

    const menu = screen.getByText("Copy & Overwrite").closest("div");
    if (!menu) {
      throw new Error("menu element not found");
    }

    await user.click(menu);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("triggers each action button", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <DropPrompt
        dropPrompt={{ paths: ["/a"], targetPath: "/", x: 0, y: 0 }}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    );

    const cases = [
      {
        label: "Copy & Overwrite",
        action: { operation: "copy", strategy: "overwrite" },
      },
      {
        label: "Copy & Skip",
        action: { operation: "copy", strategy: "skip" },
      },
      {
        label: "Move & Overwrite",
        action: { operation: "move", strategy: "overwrite" },
      },
      {
        label: "Move & Skip",
        action: { operation: "move", strategy: "skip" },
      },
    ] as const;

    for (const { label, action } of cases) {
      await user.click(screen.getByText(label));
      expect(onAction).toHaveBeenCalledWith(action);
    }
  });
});
