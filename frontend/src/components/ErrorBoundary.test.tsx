import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

const ThrowingChild = ({ message = "Boom" }: { message?: string }) => {
  throw new Error(message);
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("renders fallback UI with error details when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="kaboom" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred while rendering the app/i),
    ).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Unhandled render error:",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it("reloads the page when the reload button is clicked", async () => {
    const user = userEvent.setup();
    const reloadSpy = vi.fn();
    const locationSpy = vi
      .spyOn(window, "location", "get")
      .mockReturnValue({ ...window.location, reload: reloadSpy } as Location);

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(reloadSpy).toHaveBeenCalled();
    locationSpy.mockRestore();
  });
});
