import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "./auth";

describe("auth store", () => {
  const initialState = useAuthStore.getState();

  beforeEach(() => {
    useAuthStore.setState(initialState, true);
  });

  it("defaults to no auth requirement and no logout handler", () => {
    const state = useAuthStore.getState();
    expect(state.authRequired).toBe(false);
    expect(state.logout).toBeNull();
  });

  it("sets auth required flag", () => {
    useAuthStore.getState().setAuthRequired(true);
    expect(useAuthStore.getState().authRequired).toBe(true);
  });

  it("stores a logout handler", () => {
    const handler = () => "logged-out";
    useAuthStore.getState().setLogoutHandler(handler);
    expect(useAuthStore.getState().logout).toBe(handler);
    expect(useAuthStore.getState().logout?.()).toBe("logged-out");
  });
});
