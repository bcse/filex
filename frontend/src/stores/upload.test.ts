import { beforeEach, describe, expect, it } from "vitest";
import { useUploadStore, type UploadItem } from "./upload";

describe("upload store", () => {
  const initialState = useUploadStore.getState();

  const makeItem = (overrides: Partial<UploadItem> = {}): UploadItem => ({
    id: "1",
    name: "file.txt",
    size: 100,
    progress: 0,
    status: "pending",
    ...overrides,
  });

  beforeEach(() => {
    useUploadStore.setState(initialState, true);
  });

  it("adds uploads to the map", () => {
    const item = makeItem({ id: "a" });
    useUploadStore.getState().addUpload(item);

    const uploads = useUploadStore.getState().uploads;
    expect(uploads).toBeInstanceOf(Map);
    expect(uploads.get("a")).toEqual(item);
  });

  it("updates progress when item exists", () => {
    const item = makeItem({ id: "a", progress: 10 });
    useUploadStore.getState().addUpload(item);
    useUploadStore.getState().updateProgress("a", 60);

    expect(useUploadStore.getState().uploads.get("a")?.progress).toBe(60);
  });

  it("does not create items when updating progress for missing id", () => {
    useUploadStore.getState().updateProgress("missing", 20);
    expect(useUploadStore.getState().uploads.size).toBe(0);
  });

  it("sets status and marks completed items as 100%", () => {
    const item = makeItem({ id: "a", progress: 40 });
    useUploadStore.getState().addUpload(item);
    useUploadStore.getState().setStatus("a", "completed");

    const updated = useUploadStore.getState().uploads.get("a");
    expect(updated?.status).toBe("completed");
    expect(updated?.progress).toBe(100);
  });

  it("stores error status and message", () => {
    const item = makeItem({ id: "a", progress: 70 });
    useUploadStore.getState().addUpload(item);
    useUploadStore.getState().setStatus("a", "error", "network");

    const updated = useUploadStore.getState().uploads.get("a");
    expect(updated?.status).toBe("error");
    expect(updated?.error).toBe("network");
    expect(updated?.progress).toBe(70);
  });

  it("removes uploads by id", () => {
    useUploadStore.getState().addUpload(makeItem({ id: "a" }));
    useUploadStore.getState().removeUpload("a");

    expect(useUploadStore.getState().uploads.size).toBe(0);
  });

  it("clears completed and error uploads only", () => {
    useUploadStore.getState().addUpload(makeItem({ id: "a", status: "error" }));
    useUploadStore
      .getState()
      .addUpload(makeItem({ id: "b", status: "completed" }));
    useUploadStore
      .getState()
      .addUpload(makeItem({ id: "c", status: "uploading" }));

    useUploadStore.getState().clearCompleted();

    const uploads = useUploadStore.getState().uploads;
    expect(uploads.has("a")).toBe(false);
    expect(uploads.has("b")).toBe(false);
    expect(uploads.has("c")).toBe(true);
  });
});
