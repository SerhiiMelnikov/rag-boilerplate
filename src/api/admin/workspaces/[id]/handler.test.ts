import { describe, it, expect, vi } from "vitest";
import { patchWorkspaceResponse, deleteWorkspaceResponse } from "./handler";
import { WorkspaceNotFoundError, DefaultWorkspaceProtectedError, DuplicateWorkspaceNameError } from "@/lib/workspaces/admin";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" }));
const json = (b: unknown) => new Request("http://x/api/admin/workspaces/w1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const req = () => new Request("http://x/api/admin/workspaces/w1", { method: "DELETE" });

describe("patchWorkspaceResponse", () => {
  it("updates and returns ok", async () => {
    const updateWorkspaceFn = vi.fn(async () => {});
    const res = await patchWorkspaceResponse("w1", json({ description: "hi" }), { getAdmin: admin as never, updateWorkspaceFn: updateWorkspaceFn as never });
    expect(res.status).toBe(200);
    expect(updateWorkspaceFn).toHaveBeenCalledWith("w1", { description: "hi" });
  });
  it("400s when neither name nor description is present", async () => {
    const res = await patchWorkspaceResponse("w1", json({}), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });
  it("403s when renaming General", async () => {
    const updateWorkspaceFn = vi.fn(async () => { throw new DefaultWorkspaceProtectedError(); });
    const res = await patchWorkspaceResponse("w1", json({ name: "x" }), { getAdmin: admin as never, updateWorkspaceFn: updateWorkspaceFn as never });
    expect(res.status).toBe(403);
  });
  it("404s on an unknown workspace", async () => {
    const updateWorkspaceFn = vi.fn(async () => { throw new WorkspaceNotFoundError(); });
    const res = await patchWorkspaceResponse("nope", json({ name: "x" }), { getAdmin: admin as never, updateWorkspaceFn: updateWorkspaceFn as never });
    expect(res.status).toBe(404);
  });
  it("409s on a duplicate name", async () => {
    const updateWorkspaceFn = vi.fn(async () => { throw new DuplicateWorkspaceNameError(); });
    const res = await patchWorkspaceResponse("w1", json({ name: "General" }), { getAdmin: admin as never, updateWorkspaceFn: updateWorkspaceFn as never });
    expect(res.status).toBe(409);
  });
});

describe("deleteWorkspaceResponse", () => {
  it("deletes and returns ok", async () => {
    const deleteWorkspaceFn = vi.fn(async () => {});
    const res = await deleteWorkspaceResponse("w1", req(), { getAdmin: admin as never, deleteWorkspaceFn: deleteWorkspaceFn as never });
    expect(res.status).toBe(200);
    expect(deleteWorkspaceFn).toHaveBeenCalledWith("w1");
  });
  it("403s when deleting General", async () => {
    const deleteWorkspaceFn = vi.fn(async () => { throw new DefaultWorkspaceProtectedError(); });
    const res = await deleteWorkspaceResponse("w1", req(), { getAdmin: admin as never, deleteWorkspaceFn: deleteWorkspaceFn as never });
    expect(res.status).toBe(403);
  });
  it("404s on an unknown workspace", async () => {
    const deleteWorkspaceFn = vi.fn(async () => { throw new WorkspaceNotFoundError(); });
    const res = await deleteWorkspaceResponse("nope", req(), { getAdmin: admin as never, deleteWorkspaceFn: deleteWorkspaceFn as never });
    expect(res.status).toBe(404);
  });
});
