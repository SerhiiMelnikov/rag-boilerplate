import { describe, it, expect, vi } from "vitest";
import { reembedImageCaption } from "./recaption";

const settings = {} as never;

function fakeRepo() {
  const statuses: string[] = [];
  return {
    statuses,
    createImage: vi.fn(), getByIds: vi.fn(),
    setStatus: vi.fn(async (_id: string, s: string) => { statuses.push(s); }),
    setCaption: vi.fn(async () => {}),
  };
}

describe("reembedImageCaption", () => {
  it("re-embeds the new caption and marks ready", async () => {
    const repo = fakeRepo();
    const store = { upsertImage: vi.fn(async () => {}), searchImages: vi.fn(), deleteImage: vi.fn() };
    const res = await reembedImageCaption("img-1", "a red bicycle", { embed: async (t) => t.map(() => [0.1, 0.2]), imageRepo: repo as never, imageVectorStore: store as never, settings });
    expect(res.status).toBe("ready");
    expect(store.upsertImage).toHaveBeenCalledWith({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(repo.setCaption).toHaveBeenCalledWith("img-1", "a red bicycle");
    expect(repo.statuses).toEqual(["processing", "ready"]);
  });

  it("records error status and never throws when embedding fails", async () => {
    const repo = fakeRepo();
    const store = { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn() };
    const res = await reembedImageCaption("img-1", "x", { embed: async () => { throw new Error("embed down"); }, imageRepo: repo as never, imageVectorStore: store as never, settings });
    expect(res.status).toBe("error");
    expect(res.error).toContain("embed down");
    expect(repo.statuses).toEqual(["processing", "error"]);
    expect(store.upsertImage).not.toHaveBeenCalled();
  });
});
