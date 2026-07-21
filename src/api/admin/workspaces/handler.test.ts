import { describe, it, expect, vi } from "vitest";
import { listWorkspacesResponse, createWorkspaceResponse } from "./handler";
import { DuplicateWorkspaceNameError } from "@/lib/workspaces/admin";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" }));
const json = (b: unknown) => new Request("http://x/api/admin/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const req = () => new Request("http://x/api/admin/workspaces");

describe("listWorkspacesResponse", () => {
  it("returns the workspaces", async () => {
    const res = await listWorkspacesResponse(req(), { getAdmin: admin as never, listWorkspacesFn: (async () => [{ id: "w1", name: "General", description: null, isDefault: true, createdAt: new Date(0) }]) as never });
    expect(res.status).toBe(200);
    expect((await res.json()).workspaces).toHaveLength(1);
  });
});

describe("createWorkspaceResponse", () => {
  it("201s with the new id", async () => {
    const createWorkspaceFn = vi.fn(async () => "w2");
    const res = await createWorkspaceResponse(json({ name: "Marketing", description: "team space" }), { getAdmin: admin as never, createWorkspaceFn: createWorkspaceFn as never });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "w2" });
    expect(createWorkspaceFn).toHaveBeenCalledWith({ name: "Marketing", description: "team space" });
  });

  it("400s on an empty name", async () => {
    const res = await createWorkspaceResponse(json({ name: "   " }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate name", async () => {
    const createWorkspaceFn = vi.fn(async () => { throw new DuplicateWorkspaceNameError(); });
    const res = await createWorkspaceResponse(json({ name: "General" }), { getAdmin: admin as never, createWorkspaceFn: createWorkspaceFn as never });
    expect(res.status).toBe(409);
  });
});
