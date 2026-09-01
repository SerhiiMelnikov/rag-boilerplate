import { describe, it, expect, vi } from "vitest";
import { syncPreviewResponse, syncApplyResponse } from "./handler";
import { ForbiddenError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "u1" }));
const previewReq = () => new Request("http://x/api/admin/documents/sync/preview", { method: "POST" });
const applyReq = (body: unknown) => new Request("http://x/api/admin/documents/sync/apply", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("syncPreviewResponse", () => {
  it("403s a non-admin", async () => {
    const res = await syncPreviewResponse(previewReq(), { getAdmin: (async () => { throw new ForbiddenError(); }) as never, plan: vi.fn() as never });
    expect(res.status).toBe(403);
  });
  it("returns the plan", async () => {
    const plan = vi.fn(async () => ({ add: ["/d/a.md"], update: [], delete: [], dirs: ["/d"], errors: [] }));
    const res = await syncPreviewResponse(previewReq(), { getAdmin: admin as never, plan: plan as never });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ add: ["/d/a.md"], update: [], delete: [], dirs: ["/d"], errors: [] });
  });
  it("409s when no directories are configured", async () => {
    const plan = vi.fn(async () => { throw new Error("No documents directories are configured."); });
    const res = await syncPreviewResponse(previewReq(), { getAdmin: admin as never, plan: plan as never });
    expect(res.status).toBe(409);
  });
});

describe("syncApplyResponse", () => {
  it("403s a non-admin", async () => {
    const res = await syncApplyResponse(applyReq({ add: [], update: [], delete: [] }), { getAdmin: (async () => { throw new ForbiddenError(); }) as never, apply: vi.fn() as never });
    expect(res.status).toBe(403);
  });
  it("applies the confirmed plan and returns counts", async () => {
    const apply = vi.fn(async () => ({ added: 1, updated: 0, deleted: 2 }));
    const res = await syncApplyResponse(applyReq({ add: ["/d/a.md"], update: [], delete: ["/d/b.md", "/d/c.md"] }), { getAdmin: admin as never, apply: apply as never });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 1, updated: 0, deleted: 2 });
    expect(apply).toHaveBeenCalledWith({ add: ["/d/a.md"], update: [], delete: ["/d/b.md", "/d/c.md"] }, expect.anything());
  });
  it("400s a malformed body", async () => {
    const res = await syncApplyResponse(applyReq({ add: "nope" }), { getAdmin: admin as never, apply: vi.fn() as never });
    expect(res.status).toBe(400);
  });
});
