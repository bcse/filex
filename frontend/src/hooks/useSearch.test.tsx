import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearch } from "./useSearch";
import { api } from "@/api/client";
import { useNavigationStore } from "@/stores/navigation";

vi.mock("@/api/client", () => ({
  api: {
    search: vi.fn(),
  },
}));

vi.mock("@/stores/navigation", () => ({
  useNavigationStore: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedUseNavigationStore = vi.mocked(useNavigationStore);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseNavigationStore.mockReturnValue({
    searchOffset: 5,
    searchLimit: 50,
    searchSortConfig: { field: "width", order: "asc" },
  } as ReturnType<typeof useNavigationStore>);
});

describe("useSearch", () => {
  it("debounces and maps sort fields", async () => {
    mockedApi.search.mockResolvedValue({} as never);
    const { wrapper } = createWrapper();

    renderHook(() => useSearch("cats"), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => {
      expect(mockedApi.search).toHaveBeenCalledWith(
        "cats",
        expect.objectContaining({
          offset: 5,
          limit: 50,
          sort_by: "resolutions",
          sort_order: "asc",
        }),
      );
    });
  });

  it("does not search for short queries", async () => {
    const { wrapper } = createWrapper();

    renderHook(() => useSearch("a"), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mockedApi.search).not.toHaveBeenCalled();
  });

  it("respects disabled option", async () => {
    const { wrapper } = createWrapper();

    renderHook(() => useSearch("cats", { enabled: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mockedApi.search).not.toHaveBeenCalled();
  });
});
