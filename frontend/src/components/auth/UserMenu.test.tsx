import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "./UserMenu";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: {
    logout: mocks.logout,
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

describe("UserMenu", () => {
  beforeEach(() => {
    mocks.logout.mockReset();
  });

  it("logs out and invokes onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    mocks.logout.mockResolvedValue({ success: true });

    render(<UserMenu onLogout={onLogout} />);

    await user.click(screen.getByTitle("Sign out"));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });

  it("invokes onLogout when logout fails", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    mocks.logout.mockRejectedValue(new Error("fail"));

    render(<UserMenu onLogout={onLogout} />);

    await user.click(screen.getByTitle("Sign out"));

    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });

  it("disables the button while logging out", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const deferred = createDeferred<{ success: boolean }>();
    mocks.logout.mockReturnValue(deferred.promise);

    render(<UserMenu onLogout={onLogout} />);

    await user.click(screen.getByTitle("Sign out"));

    expect(screen.getByTitle("Sign out")).toBeDisabled();

    deferred.resolve({ success: true });

    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });
});
