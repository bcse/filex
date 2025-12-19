import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

const makeJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds browse query params", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ items: [], total: 0 }));

    await api.listDirectory("/docs", {
      offset: 10,
      limit: 5,
      sort_by: "name",
      sort_order: "desc",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/browse?path=%2Fdocs&offset=10&limit=5&sort_by=name&sort_order=desc",
    );
    expect(options).toEqual({ signal: undefined });
  });

  it("builds search query params", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ items: [], total: 0 }));

    await api.search("report", {
      offset: 2,
      limit: 20,
      sort_by: "size",
      sort_order: "asc",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/search?q=report&offset=2&limit=20&sort_by=size&sort_order=asc",
    );
    expect(options).toEqual({ signal: undefined });
  });

  it("throws ApiError with fallback message on error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 500 }));

    await expect(api.getTree("/")).rejects.toMatchObject({
      status: 500,
      message: "Unknown error",
    });
  });

  it("throws ApiError with server message on error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ error: "Nope" }, 403));

    await expect(api.getTree("/")).rejects.toMatchObject({
      status: 403,
      message: "Nope",
    });
  });

  it("sends createDirectory payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ success: true }));

    await api.createDirectory("/new-folder");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files/mkdir");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/new-folder" }),
    });
  });

  it("sends rename payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ success: true }));

    await api.rename("/old.txt", "new.txt");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files/rename");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/old.txt", new_name: "new.txt" }),
    });
  });

  it("sends move and copy payloads", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ success: true }))
      .mockResolvedValueOnce(makeJsonResponse({ success: true }));

    await api.move("/from.txt", "/to.txt");
    await api.copy("/from.txt", "/to.txt", true);

    const [moveUrl, moveOptions] = fetchMock.mock.calls[0];
    const [copyUrl, copyOptions] = fetchMock.mock.calls[1];

    expect(moveUrl).toBe("/api/files/move");
    expect(moveOptions).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "/from.txt",
        to: "/to.txt",
        overwrite: false,
      }),
    });
    expect(copyUrl).toBe("/api/files/copy");
    expect(copyOptions).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "/from.txt",
        to: "/to.txt",
        overwrite: true,
      }),
    });
  });

  it("sends delete payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ success: true }));

    await api.delete("/old.txt");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files/delete");
    expect(options).toMatchObject({
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/old.txt" }),
    });
  });

  it("returns download url with query params", () => {
    expect(api.getDownloadUrl("/path/to/file.txt")).toBe(
      "/api/files/download?path=%2Fpath%2Fto%2Ffile.txt",
    );
  });

  it("reads text content with a byte limit", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: async () => ({
        slice: () => ({
          text: async () => "a".repeat(50),
        }),
      }),
    } as Response);

    const content = await api.getTextContent("/file.txt", 50);
    expect(content.length).toBe(50);
  });

  it("fails getTextContent when response is not ok", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(api.getTextContent("/missing.txt")).rejects.toMatchObject({
      status: 404,
      message: "Failed to fetch file content",
    });
  });

  it("uploads files with FormData", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ success: true }));

    const file = new File(["data"], "file.txt", { type: "text/plain" });
    const files = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      [Symbol.iterator]: function* () {
        yield file;
      },
    } as FileList;

    await api.upload("/target", files);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files/upload/target");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
  });

  it("uploads with progress via XHR", async () => {
    const file = new File(["data"], "file.txt", { type: "text/plain" });
    const onProgress = vi.fn();
    class MockXHR {
      static lastInstance: MockXHR | null = null;
      status = 200;
      responseText = JSON.stringify({
        success: true,
        path: "/target",
        message: "Upload complete",
      });
      upload = {
        addEventListener: vi.fn(
          (event: string, listener: (event: ProgressEvent) => void) => {
            if (event === "progress") {
              this.onProgress = listener;
            }
          },
        ),
      };
      private listeners = new Map<string, () => void>();
      private onProgress?: (event: ProgressEvent) => void;
      open = vi.fn();
      send = vi.fn();

      constructor() {
        MockXHR.lastInstance = this;
      }

      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }

      triggerProgress(loaded: number, total: number) {
        this.onProgress?.({
          lengthComputable: true,
          loaded,
          total,
        } as ProgressEvent);
      }

      triggerLoad() {
        this.listeners.get("load")?.();
      }
    }

    vi.stubGlobal(
      "XMLHttpRequest",
      MockXHR as unknown as typeof XMLHttpRequest,
    );

    const promise = api.uploadWithProgress("/target", file, onProgress);
    MockXHR.lastInstance?.triggerProgress(50, 100);
    MockXHR.lastInstance?.triggerLoad();

    const result = await promise;
    expect(result).toEqual({
      success: true,
      path: "/target",
      message: "Upload complete",
    });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(MockXHR.lastInstance?.open).toHaveBeenCalledWith(
      "POST",
      "/api/files/upload/target",
    );
  });

  it("resolves XHR upload with fallback when response is invalid JSON", async () => {
    const file = new File(["data"], "file.txt", { type: "text/plain" });
    class InvalidJsonXHR {
      static lastInstance: InvalidJsonXHR | null = null;
      status = 200;
      responseText = "not-json";
      upload = { addEventListener: vi.fn() };
      private listeners = new Map<string, () => void>();
      open = vi.fn();
      send = vi.fn(() => {
        this.listeners.get("load")?.();
      });
      constructor() {
        InvalidJsonXHR.lastInstance = this;
      }
      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }
    }

    vi.stubGlobal(
      "XMLHttpRequest",
      InvalidJsonXHR as unknown as typeof XMLHttpRequest,
    );

    await expect(
      api.uploadWithProgress("/fallback", file, () => {}),
    ).resolves.toEqual({
      success: true,
      path: "/fallback",
      message: "Upload complete",
    });
  });

  it("rejects XHR upload errors with ApiError", async () => {
    const file = new File(["data"], "file.txt", { type: "text/plain" });

    class ErrorXHR {
      status = 500;
      responseText = JSON.stringify({ error: "Upload failed" });
      upload = { addEventListener: vi.fn() };
      private listeners = new Map<string, () => void>();
      open = vi.fn();
      send = vi.fn(() => {
        this.listeners.get("load")?.();
      });
      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }
    }

    vi.stubGlobal(
      "XMLHttpRequest",
      ErrorXHR as unknown as typeof XMLHttpRequest,
    );

    await expect(
      api.uploadWithProgress("/target", file, () => {}),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects XHR upload with error event", async () => {
    const file = new File(["data"], "file.txt", { type: "text/plain" });
    class ErrorEventXHR {
      static lastInstance: ErrorEventXHR | null = null;
      status = 0;
      responseText = "";
      upload = { addEventListener: vi.fn() };
      private listeners = new Map<string, () => void>();
      open = vi.fn();
      send = vi.fn(() => {
        this.listeners.get("error")?.();
      });
      constructor() {
        ErrorEventXHR.lastInstance = this;
      }
      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }
    }

    vi.stubGlobal(
      "XMLHttpRequest",
      ErrorEventXHR as unknown as typeof XMLHttpRequest,
    );

    await expect(
      api.uploadWithProgress("/target", file, () => {}),
    ).rejects.toMatchObject({ status: 0, message: "Network error" });
  });

  it("rejects XHR upload with abort event", async () => {
    const file = new File(["data"], "file.txt", { type: "text/plain" });
    class AbortEventXHR {
      static lastInstance: AbortEventXHR | null = null;
      status = 0;
      responseText = "";
      upload = { addEventListener: vi.fn() };
      private listeners = new Map<string, () => void>();
      open = vi.fn();
      send = vi.fn(() => {
        this.listeners.get("abort")?.();
      });
      constructor() {
        AbortEventXHR.lastInstance = this;
      }
      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }
    }

    vi.stubGlobal(
      "XMLHttpRequest",
      AbortEventXHR as unknown as typeof XMLHttpRequest,
    );

    await expect(
      api.uploadWithProgress("/target", file, () => {}),
    ).rejects.toMatchObject({ status: 0, message: "Upload cancelled" });
  });

  it("sends auth requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ success: true }))
      .mockResolvedValueOnce(makeJsonResponse({ success: true }))
      .mockResolvedValueOnce(
        makeJsonResponse({ authenticated: true, auth_required: true }),
      );

    await api.login("secret");
    await api.logout();
    await api.getAuthStatus();

    const [loginUrl, loginOptions] = fetchMock.mock.calls[0];
    const [logoutUrl, logoutOptions] = fetchMock.mock.calls[1];
    const [statusUrl, statusOptions] = fetchMock.mock.calls[2];

    expect(loginUrl).toBe("/api/auth/login");
    expect(loginOptions).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret" }),
    });
    expect(logoutUrl).toBe("/api/auth/logout");
    expect(logoutOptions).toMatchObject({ method: "POST" });
    expect(statusUrl).toBe("/api/auth/status");
    expect(statusOptions).toBeUndefined();
  });

  it("sends system requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: "ok",
          version: "1.0.0",
          ffprobe_available: true,
        }),
      )
      .mockResolvedValueOnce(makeJsonResponse({ is_running: false }))
      .mockResolvedValueOnce(makeJsonResponse({ is_running: true }));

    await api.health();
    await api.getIndexStatus();
    await api.triggerIndex();

    const [healthUrl] = fetchMock.mock.calls[0];
    const [statusUrl] = fetchMock.mock.calls[1];
    const [triggerUrl, triggerOptions] = fetchMock.mock.calls[2];

    expect(healthUrl).toBe("/api/health");
    expect(statusUrl).toBe("/api/index/status");
    expect(triggerUrl).toBe("/api/index/trigger");
    expect(triggerOptions).toMatchObject({ method: "POST" });
  });
});
