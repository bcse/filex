import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RenameDialog } from "./RenameDialog";

describe("RenameDialog", () => {
  it("disables Rename when the value is empty or whitespace", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RenameDialog
        open
        onOpenChange={vi.fn()}
        value="   "
        onValueChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const renameButton = screen.getByRole("button", { name: "Rename" });
    expect(renameButton).toBeDisabled();

    await user.click(renameButton);
    expect(onConfirm).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText("New name");
    input.focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onValueChange when typing in the input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    const Wrapper = () => {
      const [value, setValue] = React.useState("");
      return (
        <RenameDialog
          open
          onOpenChange={vi.fn()}
          value={value}
          onValueChange={(nextValue) => {
            onValueChange(nextValue);
            setValue(nextValue);
          }}
          onConfirm={vi.fn()}
        />
      );
    };

    render(<Wrapper />);

    const input = screen.getByPlaceholderText("New name");
    await user.type(input, "New");

    expect(onValueChange).toHaveBeenLastCalledWith("New");
  });

  it("confirms on click or Enter when the value is valid", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RenameDialog
        open
        onOpenChange={vi.fn()}
        value="Report"
        onValueChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText("New name");
    input.focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <RenameDialog
        open
        onOpenChange={onOpenChange}
        value="Report"
        onValueChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
