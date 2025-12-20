import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const mocks = vi.hoisted(() => ({
  getAuthStatus: vi.fn(),
  setAuthRequired: vi.fn(),
  setLogoutHandler: vi.fn(),
  queryClientClear: vi.fn(),
  logoutHandler: null as null | (() => void),
}));

vi.mock("@/api/client", () => ({
  api: {
    getAuthStatus: mocks.getAuthStatus,
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    setAuthRequired: mocks.setAuthRequired,
    setLogoutHandler: (handler: () => void) => {
      mocks.logoutHandler = handler;
      mocks.setLogoutHandler(handler);
    },
  }),
}));

vi.mock("@tanstack/react-query", () => {
  class QueryClient {
    clear = mocks.queryClientClear;
  }
  const QueryClientProvider = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  );
  return { QueryClient, QueryClientProvider };
});

vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: () => <div>sidebar</div>,
}));
vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <div>topbar</div>,
}));
vi.mock("@/components/layout/MainPanel", () => ({
  MainPanel: () => <div>main-panel</div>,
}));
vi.mock("@/components/layout/UploadProgress", () => ({
  UploadProgress: () => <div>upload-progress</div>,
}));
vi.mock("@/components/preview/FilePreviewOverlay", () => ({
  FilePreviewOverlay: () => <div>file-preview</div>,
}));
vi.mock("@/components/auth/LoginPage", () => ({
  LoginPage: ({ onLoginSuccess }: { onLoginSuccess: () => void }) => (
    <div>
      <div>login-page</div>
      <button onClick={onLoginSuccess}>login</button>
    </div>
  ),
}));
vi.mock("sonner", () => ({
  Toaster: () => <div>toaster</div>,
}));

describe("App", () => {
  beforeEach(() => {
    mocks.getAuthStatus.mockReset();
    mocks.setAuthRequired.mockReset();
    mocks.setLogoutHandler.mockReset();
    mocks.queryClientClear.mockReset();
    mocks.logoutHandler = null;
  });

  it("renders loading state while auth is pending", () => {
    mocks.getAuthStatus.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders login when unauthenticated", async () => {
    mocks.getAuthStatus.mockResolvedValue({
      auth_required: true,
      authenticated: false,
    });

    render(<App />);

    expect(await screen.findByText("login-page")).toBeInTheDocument();
    expect(mocks.setAuthRequired).toHaveBeenCalledWith(true);
  });

  it("renders layout when authenticated", async () => {
    mocks.getAuthStatus.mockResolvedValue({
      auth_required: false,
      authenticated: false,
    });

    render(<App />);

    expect(await screen.findByText("topbar")).toBeInTheDocument();
    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByText("main-panel")).toBeInTheDocument();
    expect(screen.getByText("upload-progress")).toBeInTheDocument();
    expect(screen.getByText("toaster")).toBeInTheDocument();
    expect(mocks.setAuthRequired).toHaveBeenCalledWith(false);
  });

  it("supports login success transition", async () => {
    const user = userEvent.setup();
    mocks.getAuthStatus.mockResolvedValue({
      auth_required: true,
      authenticated: false,
    });

    render(<App />);

    await user.click(await screen.findByText("login"));

    expect(await screen.findByText("topbar")).toBeInTheDocument();
    expect(mocks.queryClientClear).toHaveBeenCalled();
  });

  it("uses logout handler to clear cache and show login", async () => {
    mocks.getAuthStatus.mockResolvedValue({
      auth_required: false,
      authenticated: true,
    });

    render(<App />);

    await screen.findByText("topbar");

    await waitFor(() => {
      expect(mocks.setLogoutHandler).toHaveBeenCalled();
      expect(mocks.logoutHandler).toBeTypeOf("function");
    });

    mocks.logoutHandler?.();

    expect(await screen.findByText("login-page")).toBeInTheDocument();
    expect(mocks.queryClientClear).toHaveBeenCalled();
  });
});
