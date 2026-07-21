import { describe, it, expect, vi } from "vitest";
import { listWorkspaceUsersResponse, setWorkspaceGrantResponse } from "./handler";
import { WorkspaceNotFoundError, DefaultWorkspaceProtectedError } from "@/lib/workspaces/admin";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" }));
const json = (b: unknown) => new Request("http://x/api/admin/workspaces/w1/users", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const USER_ID = "11111111-1111-4111-8111-111111111111";
const req = () => new Request("http://x/api/admin/workspaces/w1/users");

describe("listWorkspaceUsersResponse", () => {
  it("returns users with their granted flag", async () => {
    const res = await listWorkspaceUsersResponse("w1", req(), { getAdmin: admin as never, listWorkspaceUsersFn: (async () => [{ id: USER_ID, email: "a@x", granted: true }]) as never });
    expect(res.status).toBe(200);
    expect((await res.json()).users).toEqual([{ id: USER_ID, email: "a@x", granted: true }]);
  });
  it("404s on an unknown workspace", async () => {
    const listWorkspaceUsersFn = vi.fn(async () => { throw new WorkspaceNotFoundError(); });
    const res = await listWorkspaceUsersResponse("nope", req(), { getAdmin: admin as never, listWorkspaceUsersFn: listWorkspaceUsersFn as never });
    expect(res.status).toBe(404);
  });
});

describe("setWorkspaceGrantResponse", () => {
  it("grants and returns ok", async () => {
    const setWorkspaceGrantFn = vi.fn(async () => {});
    const res = await setWorkspaceGrantResponse("w1", json({ userId: USER_ID, granted: true }), { getAdmin: admin as never, setWorkspaceGrantFn: setWorkspaceGrantFn as never });
    expect(res.status).toBe(200);
    expect(setWorkspaceGrantFn).toHaveBeenCalledWith("w1", USER_ID, true);
  });
  it("400s on a malformed body", async () => {
    const res = await setWorkspaceGrantResponse("w1", json({ userId: "not-a-uuid", granted: true }), { getAdmin: admin as never });
    expect(res.status).toBe(400);
  });
  it("403s when changing grants on General", async () => {
    const setWorkspaceGrantFn = vi.fn(async () => { throw new DefaultWorkspaceProtectedError(); });
    const res = await setWorkspaceGrantResponse("w1", json({ userId: USER_ID, granted: true }), { getAdmin: admin as never, setWorkspaceGrantFn: setWorkspaceGrantFn as never });
    expect(res.status).toBe(403);
  });
});
