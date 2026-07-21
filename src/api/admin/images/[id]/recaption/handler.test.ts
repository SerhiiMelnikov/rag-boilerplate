import { describe, it, expect, vi } from "vitest";
import { recaptionImageResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" }));
const req = () => new Request("http://x/api/admin/images/i1/recaption", { method: "POST" });

function deps(over: Record<string, unknown> = {}) {
  return {
    getAdmin: admin as never,
    imageRepo: {
      getByIds: vi.fn(async () => [{ id: "i1", filename: "a.png", caption: "old", storageKey: "k", contentType: "image/png" }]),
      setStatus: vi.fn(async () => {}),
      setCaption: vi.fn(),
      createImage: vi.fn(),
    },
    imageVectorStore: {} as never,
    objectStore: {} as never,
    getSettings: vi.fn(async () => ({}) as never),
    recaption: vi.fn(async () => ({ imageId: "i1", status: "ready" as const })),
    schedule: (fn: () => Promise<unknown>) => { void fn(); },
    ...over,
  };
}

describe("recaptionImageResponse", () => {
  it("marks the row processing before scheduling, so the list stops showing a stale 'ready'", async () => {
    const d = deps();
    const res = await recaptionImageResponse("i1", req(), d as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "processing" });
    expect(d.imageRepo.setStatus).toHaveBeenCalledWith("i1", "processing");
    expect(d.recaption).toHaveBeenCalled();
  });

  it("404s an unknown image and schedules nothing", async () => {
    const d = deps({ imageRepo: { getByIds: vi.fn(async () => []), setStatus: vi.fn(), setCaption: vi.fn(), createImage: vi.fn() } });
    const res = await recaptionImageResponse("nope", req(), d as never);
    expect(res.status).toBe(404);
    expect(d.recaption).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller and touches nothing", async () => {
    const d = deps({ getAdmin: (async () => { throw new UnauthorizedError(); }) as never });
    const res = await recaptionImageResponse("i1", req(), d as never);
    expect(res.status).toBe(401);
    expect(d.imageRepo.setStatus).not.toHaveBeenCalled();
    expect(d.recaption).not.toHaveBeenCalled();
  });
});
