import { describe, it, expect, vi } from "vitest";
import { serveImage } from "./handler";
import type { ImageRepo } from "@/lib/images/repo";
import type { ObjectStore } from "@/lib/images/storage";

const user = async () => ({ id: "u1", role: "user", isSuperAdmin: false });
const req = () => new Request("http://x/api/images/img-1");

function repoWith(records: { id: string; storageKey: string; contentType: string }[]): ImageRepo {
  return {
    createImage: vi.fn(), setStatus: vi.fn(), setCaption: vi.fn(),
    getByIds: vi.fn(async (ids: string[]) => records.filter((r) => ids.includes(r.id)).map((r) => ({ ...r, filename: "x.png", caption: "" }))),
  } as unknown as ImageRepo;
}

describe("serveImage", () => {
  it("streams the image bytes with its content type", async () => {
    const repo = repoWith([{ id: "img-1", storageKey: "images/a.png", contentType: "image/png" }]);
    const store: ObjectStore = { put: vi.fn(), delete: vi.fn(), get: vi.fn(async () => ({ body: Buffer.from([1, 2, 3]), contentType: "image/png" })) };
    const res = await serveImage("img-1", req(), { getUser: user as never, imageRepo: repo, objectStore: store });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.get).toHaveBeenCalledWith("images/a.png");
  });

  it("404s an unknown image id", async () => {
    const repo = repoWith([]);
    const store: ObjectStore = { put: vi.fn(), delete: vi.fn(), get: vi.fn() };
    const res = await serveImage("nope", req(), { getUser: user as never, imageRepo: repo, objectStore: store });
    expect(res.status).toBe(404);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated request", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/guards");
    const repo = repoWith([]);
    const store: ObjectStore = { put: vi.fn(), delete: vi.fn(), get: vi.fn() };
    const res = await serveImage("img-1", req(), { getUser: (async () => { throw new UnauthorizedError(); }) as never, imageRepo: repo, objectStore: store });
    expect(res.status).toBe(401);
  });
});
