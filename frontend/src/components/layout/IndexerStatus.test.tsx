import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useIndexerStatus: vi.fn(),
  useIndexer: vi.fn(),
}));

vi.mock("@/hooks/useDirectory", () => ({
  useIndexerStatus: () => mocks.useIndexerStatus(),
  useIndexer: () => mocks.useIndexer(),
}));

import { IndexerStatus } from "./IndexerStatus";

describe("IndexerStatus", () => {
  beforeEach(() => {
    const triggerIndex = { mutate: vi.fn(), isPending: false };
    mocks.useIndexerStatus.mockReturnValue({
      data: { is_running: false },
      isLoading: false,
    });
    mocks.useIndexer.mockReturnValue({
      triggerIndex,
    });
  });

  it("triggers indexing when clicked", () => {
    const triggerIndex = { mutate: vi.fn(), isPending: false };
    mocks.useIndexer.mockReturnValue({ triggerIndex });

    render(<IndexerStatus />);

    fireEvent.click(screen.getByRole("button"));

    expect(triggerIndex.mutate).toHaveBeenCalled();
  });

  it("disables the button while indexing", () => {
    mocks.useIndexerStatus.mockReturnValue({
      data: { is_running: true },
      isLoading: false,
    });

    render(<IndexerStatus />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.getByText("Indexing in progress")).toBeInTheDocument();
  });
});
