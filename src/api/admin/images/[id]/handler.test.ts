import { describe, it, expect, vi } from "vitest";
import { patchImageCaption, deleteImageResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const admin = async () => ({ id: "a1", role: "admin", isSuperAdmin: false });
function req(body: unknown) {
  return new Request("http://x/api/admin/images/img-1", { method: "PATCH", body: JSON.stringify(body) });
}
function deleteReq() {
  return new Request("http://x/api/admin/images/img-1", { method: "DELETE" });
}
const baseDeps = () => ({
  getAdmin: admin as never,
  imageRepo: { getByIds: vi.fn(async () => [{ id: "img-1", filename: "b.png", caption: "old", storageKey: "images/b.png", contentType: "image/png" }]), createImage: vi.fn(), setStatus: vi.fn(), setCaption: vi.fn() },
  imageVectorStore: { upsertImage: vi.fn(), searchImages: vi.fn(), deleteImage: vi.fn() },
  getSettings: async () => ({}) as never,
  reembed: vi.fn(async () => ({ imageId: "img-1", status: "ready" as const })),
  schedule: (fn: () => Promise<unknown>) => { void fn(); },
});

describe("patchImageCaption", () => {
  it("schedules a re-embed and returns processing", async () => {
    const deps = baseDeps();
    const res = await patchImageCaption("img-1", req({ caption: "a new caption" }), deps as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "processing" });
    expect(deps.imageRepo.setStatus).toHaveBeenCalledWith("img-1", "processing");
    expect(deps.reembed).toHaveBeenCalledWith("img-1", "a new caption", expect.anything());
  });

  it("400s an empty caption without scheduling", async () => {
    const deps = baseDeps();
    const res = await patchImageCaption("img-1", req({ caption: "   " }), deps as never);
    expect(res.status).toBe(400);
    expect(deps.imageRepo.setStatus).not.toHaveBeenCalled();
    expect(deps.reembed).not.toHaveBeenCalled();
  });

  it("404s an unknown image id", async () => {
    const deps = baseDeps();
    deps.imageRepo.getByIds = vi.fn(async () => []);
    const res = await patchImageCaption("nope", req({ caption: "x" }), deps as never);
    expect(res.status).toBe(404);
    expect(deps.imageRepo.setStatus).not.toHaveBeenCalled();
    expect(deps.reembed).not.toHaveBeenCalled();
  });
});

describe("deleteImageResponse", () => {
  it("204s once the image is removed", async () => {
    const deps = { getAdmin: admin as never, deleteImage: vi.fn(async () => true) };
    const res = await deleteImageResponse(deleteReq(), "img-1", deps as never);
    expect(res.status).toBe(204);
    expect(deps.deleteImage).toHaveBeenCalledWith("img-1");
  });

  it("404s an unknown image id", async () => {
    const deps = { getAdmin: admin as never, deleteImage: vi.fn(async () => false) };
    const res = await deleteImageResponse(deleteReq(), "nope", deps as never);
    expect(res.status).toBe(404);
  });

  it("401s an anonymous caller and never deletes", async () => {
    const deleteImage = vi.fn(async () => true);
    const deps = { getAdmin: (async () => { throw new UnauthorizedError(); }) as never, deleteImage };
    const res = await deleteImageResponse(deleteReq(), "img-1", deps as never);
    expect(res.status).toBe(401);
    expect(deleteImage).not.toHaveBeenCalled();
  });
});
