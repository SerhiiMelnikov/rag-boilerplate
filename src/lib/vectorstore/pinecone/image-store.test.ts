import { describe, it, expect, vi } from "vitest";
import { createPineconeImageStore } from "./image-store";

describe("createPineconeImageStore", () => {
  it("upserts by imageId; maps query matches to imageId+score", async () => {
    const dense = {
      upsert: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ matches: [{ id: "img-1", score: 0.91 }] })),
      deleteMany: vi.fn(async () => ({})),
      fetch: vi.fn(),
      listPaginated: vi.fn(),
    };
    const store = createPineconeImageStore(() => dense);
    await store.upsertImage({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(dense.upsert).toHaveBeenCalledWith([{ id: "img-1", values: [0.1, 0.2], metadata: {} }]);
    const hits = await store.searchImages([0.1, 0.2], 3);
    expect(hits).toEqual([{ imageId: "img-1", score: 0.91 }]);
  });
});
