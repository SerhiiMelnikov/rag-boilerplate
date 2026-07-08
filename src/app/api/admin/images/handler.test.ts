import { describe, it, expect, vi } from "vitest";
import { uploadImage } from "./handler";

const admin = async () => ({ id: "a1", role: "admin", isSuperAdmin: false });

function pngRequest(type = "image/png", bytes = 10) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "pic.png", { type }));
  return new Request("http://x/api/admin/images", { method: "POST", body: form });
}

const baseDeps = () => ({
  getAdmin: admin as never,
  objectStore: { put: vi.fn(async () => {}), get: vi.fn(), delete: vi.fn() },
  imageRepo: { createImage: vi.fn(async () => "img-1"), setStatus: vi.fn(async () => {}), setCaption: vi.fn(), getByIds: vi.fn() },
  imageVectorStore: { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn() },
  getSettings: async () => ({}) as never,
  ingest: vi.fn(async () => ({ imageId: "img-1", status: "ready" as const })),
  schedule: (fn: () => Promise<unknown>) => { void fn(); },
  newId: () => "uuid-1",
});

describe("uploadImage", () => {
  it("stores the object, creates the row, schedules ingest, returns processing", async () => {
    const deps = baseDeps();
    const res = await uploadImage(pngRequest(), deps as never);
    expect(res.status).toBe(200);
    expect(deps.objectStore.put).toHaveBeenCalledWith("images/uuid-1.png", expect.any(Buffer), "image/png");
    expect(deps.imageRepo.createImage).toHaveBeenCalled();
    expect(deps.ingest).toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ imageId: "img-1", status: "processing" });
  });

  it("rejects an unsupported type with 400", async () => {
    const deps = baseDeps();
    const res = await uploadImage(pngRequest("application/pdf"), deps as never);
    expect(res.status).toBe(400);
    expect(deps.objectStore.put).not.toHaveBeenCalled();
  });

  it("rejects an oversized file with 400", async () => {
    const deps = baseDeps();
    const res = await uploadImage(pngRequest("image/png", 11 * 1024 * 1024), deps as never);
    expect(res.status).toBe(400);
    expect(deps.objectStore.put).not.toHaveBeenCalled();
  });
});
