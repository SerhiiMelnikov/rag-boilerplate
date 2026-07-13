import { describe, it, expect, vi } from "vitest";
import { recaptionImageFromSource } from "./recaption-source";

const settings = {} as never;

function deps(over: Record<string, unknown> = {}) {
  return {
    imageRepo: {
      getByIds: vi.fn(async () => [{ id: "i1", filename: "a.png", caption: "old", storageKey: "images/a.png", contentType: "image/png" }]),
      setStatus: vi.fn(async () => {}),
      setCaption: vi.fn(async () => {}),
      createImage: vi.fn(),
    },
    objectStore: { get: vi.fn(async () => ({ body: Buffer.from("bytes"), contentType: "image/png" })), put: vi.fn(), delete: vi.fn() },
    ingest: vi.fn(async () => ({ imageId: "i1", status: "ready" as const })),
    imageVectorStore: {} as never,
    settings,
    ...over,
  };
}

describe("recaptionImageFromSource", () => {
  it("re-runs the vision model on the stored bytes — no re-upload", async () => {
    const d = deps();
    const res = await recaptionImageFromSource("i1", d as never);
    expect(res.status).toBe("ready");
    expect(d.objectStore.get).toHaveBeenCalledWith("images/a.png");
    // The existing ingest path does caption -> embed -> upsert -> setCaption -> ready.
    expect(d.ingest).toHaveBeenCalledWith("i1", { data: expect.any(Buffer), contentType: "image/png" }, expect.anything());
  });

  it("errors when the image does not exist, without touching storage", async () => {
    const d = deps({ imageRepo: { getByIds: vi.fn(async () => []), setStatus: vi.fn(async () => {}), setCaption: vi.fn(), createImage: vi.fn() } });
    const res = await recaptionImageFromSource("nope", d as never);
    expect(res.status).toBe("error");
    expect(d.objectStore.get).not.toHaveBeenCalled();
    expect(d.ingest).not.toHaveBeenCalled();
  });

  // Mirrors ingestImage/reembedImageCaption: a background job must never throw.
  it("records a storage failure on the row instead of throwing", async () => {
    const d = deps({ objectStore: { get: vi.fn(async () => { throw new Error("s3 down"); }), put: vi.fn(), delete: vi.fn() } });
    const res = await recaptionImageFromSource("i1", d as never);
    expect(res).toEqual({ imageId: "i1", status: "error", error: "s3 down" });
    expect(d.imageRepo.setStatus).toHaveBeenCalledWith("i1", "error", "s3 down");
  });
});
