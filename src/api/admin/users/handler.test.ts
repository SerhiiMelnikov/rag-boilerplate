import { describe, it, expect, vi } from "vitest";
import { listUsersResponse } from "./handler";
import { ForbiddenError } from "@/lib/auth/guards";

const superAdmin = vi.fn(async () => ({ id: "s", role: "admin", isSuperAdmin: true }));
const req = () => new Request("http://x/api/admin/users");

describe("listUsersResponse", () => {
  it("403s a non-super-admin and does not touch the repo", async () => {
    const listUsersFn = vi.fn();
    const res = await listUsersResponse(req(), {
      getSuperAdmin: (async () => { throw new ForbiddenError(); }) as never,
      listUsersFn: listUsersFn as never,
    });
    expect(res.status).toBe(403);
    expect(listUsersFn).not.toHaveBeenCalled();
  });

  it("lists users for the super-admin", async () => {
    const listUsersFn = vi.fn(async () => [{ id: "u1", email: "e", role: "user", isSuperAdmin: false, blockedAt: null, createdAt: new Date(0) }]);
    const res = await listUsersResponse(req(), { getSuperAdmin: superAdmin as never, listUsersFn: listUsersFn as never });
    expect(res.status).toBe(200);
    expect((await res.json()).users).toHaveLength(1);
  });
});
