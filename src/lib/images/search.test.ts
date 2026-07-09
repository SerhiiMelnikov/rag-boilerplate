import { describe, it, expect, vi } from "vitest";
import { searchImages } from "./search";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import type { ImageRepo } from "./repo";

const settings = { embeddingProvider: "google", embeddingModel: "gemini-embedding-2" } as never;

describe("searchImages", () => {
  it("embeds the query, filters by minScore, and joins metadata in score order", async () => {
    const store: ImageVectorStore = {
      upsertImage: vi.fn(),
      deleteImage: vi.fn(),
      searchImages: vi.fn(async () => [
        { imageId: "img-1", score: 0.9 },
        { imageId: "img-2", score: 0.2 }, // below threshold, dropped
      ]),
    };
    const repo = {
      getByIds: vi.fn(async () => [
        { id: "img-1", filename: "bike.png", caption: "a red bicycle", storageKey: "images/bike.png", contentType: "image/png" },
      ]),
    } as unknown as ImageRepo;

    const hits = await searchImages("red bike", { topN: 5, minScore: 0.3 }, {
      embed: async () => [0.1, 0.2],
      imageVectorStore: store, imageRepo: repo, settings,
    });

    expect(store.searchImages).toHaveBeenCalledWith([0.1, 0.2], 5);
    expect(hits).toEqual([{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]);
  });

  it("returns [] when nothing clears the threshold", async () => {
    const store: ImageVectorStore = {
      upsertImage: vi.fn(), deleteImage: vi.fn(),
      searchImages: vi.fn(async () => [{ imageId: "img-1", score: 0.1 }]),
    };
    const repo = { getByIds: vi.fn(async () => []) } as unknown as ImageRepo;
    const hits = await searchImages("x", { topN: 5, minScore: 0.3 }, { embed: async () => [0.1], imageVectorStore: store, imageRepo: repo, settings });
    expect(hits).toEqual([]);
    expect(repo.getByIds).not.toHaveBeenCalled();
  });

  it("drops matches outside allowedImageIds and over-fetches to compensate", async () => {
    const searchImages_ = vi.fn(async (_vector: number[], _limit: number) => [
      { imageId: "i1", score: 0.9 }, { imageId: "i2", score: 0.8 }, { imageId: "i3", score: 0.7 },
    ]);
    const getByIds = vi.fn(async (ids: string[]) => ids.map((id) => ({ id, filename: `${id}.png`, caption: id, storageKey: id, contentType: "image/png" })));
    const hits = await searchImages(
      "cat",
      { topN: 2, minScore: 0, allowedImageIds: ["i1", "i3"] },
      { embed: async () => [0.1], imageVectorStore: { searchImages: searchImages_ } as never, imageRepo: { getByIds } as never, settings: {} as never },
    );
    expect(hits.map((h) => h.imageId)).toEqual(["i1", "i3"]);
    // over-fetch: asked the store for more than topN
    expect(searchImages_.mock.calls[0][1]).toBeGreaterThan(2);
  });

  it("returns [] without querying when allowedImageIds is empty", async () => {
    const searchImages_ = vi.fn();
    const hits = await searchImages(
      "cat",
      { topN: 2, minScore: 0, allowedImageIds: [] },
      { embed: async () => [0.1], imageVectorStore: { searchImages: searchImages_ } as never, imageRepo: { getByIds: vi.fn() } as never, settings: {} as never },
    );
    expect(hits).toEqual([]);
    expect(searchImages_).not.toHaveBeenCalled();
  });
});
