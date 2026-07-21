import { describe, it, expect, vi } from "vitest";
import { listVisibleWorkspacesResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

describe("listVisibleWorkspacesResponse", () => {
  it("returns the caller's visible workspaces", async () => {
    const listVisibleWorkspacesFn = vi.fn(async () => [{ id: "w1", name: "General", isDefault: true }]);
    const res = await listVisibleWorkspacesResponse({
      getUser: (async () => ({ id: "u1", role: "user", isSuperAdmin: false })) as never,
      listVisibleWorkspacesFn: listVisibleWorkspacesFn as never,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaces: [{ id: "w1", name: "General", isDefault: true }] });
    // scoped to the caller, not a global list
    expect(listVisibleWorkspacesFn).toHaveBeenCalledWith("u1");
  });

  it("401s for an anonymous caller and never lists anything", async () => {
    const listVisibleWorkspacesFn = vi.fn();
    const res = await listVisibleWorkspacesResponse({
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      listVisibleWorkspacesFn: listVisibleWorkspacesFn as never,
    });
    expect(res.status).toBe(401);
    expect(listVisibleWorkspacesFn).not.toHaveBeenCalled();
  });
});
