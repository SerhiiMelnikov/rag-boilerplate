import { describe, it, expect, vi } from "vitest";
import { ingestImage, IMAGE_CAPTION_PROMPT } from "./ingest";
import type { ImageRepo } from "./repo";
import type { ImageVectorStore } from "@/lib/vectorstore/types";

function fakeRepo(): ImageRepo & { statuses: string[]; caption?: string } {
  const rec = { statuses: [] as string[], caption: undefined as string | undefined };
  return {
    ...rec,
    async createImage() { return "img-1"; },
    async setStatus(_id: string, status: string) { rec.statuses.push(status); },
    async setCaption(_id: string, caption: string) { rec.caption = caption; },
    async getByIds() { return []; },
    get statuses() { return rec.statuses; },
    get caption() { return rec.caption; },
  } as never;
}

const settings = { imageProvider: "google", imageModel: "gemini-2.5-flash" } as never;

describe("ingestImage", () => {
  it("captions, embeds, upserts the vector, stores the caption, and marks ready", async () => {
    const repo = fakeRepo();
    const store: ImageVectorStore = { upsertImage: vi.fn(async () => {}), searchImages: vi.fn(), deleteImage: vi.fn() };
    const res = await ingestImage("img-1", { data: Buffer.from("x"), contentType: "image/png" }, {
      caption: async () => "a red bicycle",
      embed: async (texts) => texts.map(() => [0.1, 0.2]),
      imageRepo: repo, imageVectorStore: store, settings,
    });
    expect(res.status).toBe("ready");
    expect(store.upsertImage).toHaveBeenCalledWith({ imageId: "img-1", embedding: [0.1, 0.2] });
    expect(repo.caption).toBe("a red bicycle");
    expect(repo.statuses).toEqual(["processing", "ready"]);
  });

  it("records an error status and never throws when captioning fails", async () => {
    const repo = fakeRepo();
    const store: ImageVectorStore = { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn() };
    const res = await ingestImage("img-1", { data: Buffer.from("x"), contentType: "image/png" }, {
      caption: async () => { throw new Error("vision down"); },
      imageRepo: repo, imageVectorStore: store, settings,
    });
    expect(res.status).toBe("error");
    expect(res.error).toContain("vision down");
    expect(repo.statuses).toEqual(["processing", "error"]);
    expect(store.upsertImage).not.toHaveBeenCalled();
  });
});

describe("IMAGE_CAPTION_PROMPT", () => {
  // Users search images by describing the subject ("a young muscular man"), and a terse
  // caption drops exactly those attributes, so the analyzer is told to spend words on
  // any living subject.
  it("asks for a thorough description of any living subject", () => {
    expect(IMAGE_CAPTION_PROMPT).toMatch(/person, an animal, or any other living being/i);
    for (const attribute of ["age", "build", "hair", "expression", "clothing", "pose"]) {
      expect(IMAGE_CAPTION_PROMPT.toLowerCase()).toContain(attribute);
    }
  });

  it("still covers the general-purpose retrieval basics", () => {
    for (const basic of ["visible text", "colors"]) {
      expect(IMAGE_CAPTION_PROMPT.toLowerCase()).toContain(basic);
    }
  });
});
