import { describe, it, expect, vi } from "vitest";
import { deleteImage } from "./service";

describe("deleteImage", () => {
  it("removes the vector, the object, and the row", async () => {
    const imageVectorStore = { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn(async () => {}) };
    const objectStore = { put: vi.fn(), get: vi.fn(), delete: vi.fn(async () => {}) };
    const imageRepo = { createImage: vi.fn(), setStatus: vi.fn(), setCaption: vi.fn(), getByIds: vi.fn(async () => [{ id: "img-1", filename: "a.png", caption: "", storageKey: "images/a.png", contentType: "image/png" }]) };
    const database = { delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "img-1" }]) })) })) };
    const ok = await deleteImage("img-1", { database: database as never, objectStore: objectStore as never, imageVectorStore: imageVectorStore as never, imageRepo: imageRepo as never });
    expect(ok).toBe(true);
    expect(imageVectorStore.deleteImage).toHaveBeenCalledWith("img-1");
    expect(objectStore.delete).toHaveBeenCalledWith("images/a.png");
  });

  it("returns false for an unknown id and touches nothing", async () => {
    const imageVectorStore = { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn() };
    const objectStore = { put: vi.fn(), get: vi.fn(), delete: vi.fn() };
    const imageRepo = { createImage: vi.fn(), setStatus: vi.fn(), setCaption: vi.fn(), getByIds: vi.fn(async () => []) };
    const ok = await deleteImage("nope", { objectStore: objectStore as never, imageVectorStore: imageVectorStore as never, imageRepo: imageRepo as never });
    expect(ok).toBe(false);
    expect(imageVectorStore.deleteImage).not.toHaveBeenCalled();
    expect(objectStore.delete).not.toHaveBeenCalled();
  });
});
