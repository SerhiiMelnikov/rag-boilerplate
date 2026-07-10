import { describe, it, expect, vi } from "vitest";
import { listFilesResponse } from "./handler";

const admin = async () => ({ id: "a1", role: "admin", isSuperAdmin: false });

describe("listFilesResponse", () => {
  it("returns the files for an admin", async () => {
    const res = await listFilesResponse({ getAdmin: admin as never, listFilesFn: async () => [{ id: "d1", kind: "document", filename: "a.pdf", ext: "pdf", status: "ready", error: null, caption: null, workspaces: [], createdAt: new Date() }] });
    expect(res.status).toBe(200);
    expect((await res.json()).files).toHaveLength(1);
  });

  it("401s a non-admin", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/guards");
    const res = await listFilesResponse({ getAdmin: (async () => { throw new UnauthorizedError(); }) as never, listFilesFn: async () => [] });
    expect(res.status).toBe(401);
  });
});
