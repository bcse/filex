import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: {
    login: mocks.login,
  },
}));

const createDeferred = <T,>() => {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
};

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.login.mockReset();
  });

  it("disables submit until password entered", async () => {
    const user = userEvent.setup();
    render(<LoginPage onLoginSuccess={vi.fn()} />);

    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Password"), "secret");

    expect(button).toBeEnabled();
  });

  it("submits password and calls onLoginSuccess", async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    mocks.login.mockResolvedValue({ success: true });

    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("secret"));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
  });

  it("shows error when login fails", async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({
      success: false,
      error: "Bad credentials",
    });

    render(<LoginPage onLoginSuccess={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Bad credentials")).toBeInTheDocument();
  });

  it("shows generic error on exception", async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValue(new Error("boom"));

    render(<LoginPage onLoginSuccess={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText("An error occurred. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows loading state while awaiting response", async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    const deferred = createDeferred<{ success: boolean }>();
    mocks.login.mockReturnValue(deferred.promise);

    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Signing in...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    expect(screen.getByPlaceholderText("Password")).toBeDisabled();

    deferred.resolve({ success: true });

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
  });
});
