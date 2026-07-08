import { describe, it, expect, vi } from "vitest";
import { createQdrantImageStore } from "./image-store";

describe("createQdrantImageStore", () => {
  it("upsertImage writes one point keyed by imageId; searchImages maps id+score", async () => {
    const client = {
      upsert: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ points: [{ id: "img-1", score: 0.87 }] })),
      delete: vi.fn(async () => ({})),
    };
    // @ts-expect-error minimal fake client
    const store = createQdrantImageStore(client, "rag_images");
    await store.upsertImage({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(client.upsert).toHaveBeenCalledWith("rag_images", { wait: true, points: [{ id: "img-1", vector: [0.1, 0.2] }] });
    const hits = await store.searchImages([0.1, 0.2], 3);
    expect(hits).toEqual([{ imageId: "img-1", score: 0.87 }]);
  });
});
