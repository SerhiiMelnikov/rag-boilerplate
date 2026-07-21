import { describe, it, expect, vi } from "vitest";
import { patchUserResponse } from "./handler";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/guards";
import { SuperAdminProtectedError, SelfActionError, UserNotFoundError } from "@/lib/auth/user-admin";

const superAdmin = vi.fn(async () => ({ id: "s", role: "admin", isSuperAdmin: true }));
const req = (body: unknown) => new Request("http://localhost/api/admin/users/t1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("patchUserResponse", () => {
  it("401s an unauthenticated caller and does not touch the service", async () => {
    const setUserRoleFn = vi.fn();
    const res = await patchUserResponse("t1", req({ role: "admin" }), {
      getSuperAdmin: (async () => { throw new UnauthorizedError(); }) as never,
      setUserRoleFn: setUserRoleFn as never,
    });
    expect(res.status).toBe(401);
    expect(setUserRoleFn).not.toHaveBeenCalled();
  });

  it("403s a non-super-admin", async () => {
    const res = await patchUserResponse("t1", req({ role: "admin" }), {
      getSuperAdmin: (async () => { throw new ForbiddenError(); }) as never,
    });
    expect(res.status).toBe(403);
  });

  it("changes role", async () => {
    const setUserRoleFn = vi.fn(async () => {});
    const res = await patchUserResponse("t1", req({ role: "admin" }), {
      getSuperAdmin: superAdmin as never,
      setUserRoleFn: setUserRoleFn as never,
    });
    expect(res.status).toBe(200);
    expect(setUserRoleFn).toHaveBeenCalledWith("t1", "admin", "s", undefined);
  });

  it("blocks a user", async () => {
    const setUserBlockedFn = vi.fn(async () => {});
    const res = await patchUserResponse("t1", req({ blocked: true }), {
      getSuperAdmin: superAdmin as never,
      setUserBlockedFn: setUserBlockedFn as never,
    });
    expect(res.status).toBe(200);
    expect(setUserBlockedFn).toHaveBeenCalledWith("t1", true, "s", undefined);
  });

  it("400s on an invalid body (neither role nor blocked)", async () => {
    const res = await patchUserResponse("t1", req({}), { getSuperAdmin: superAdmin as never });
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON", async () => {
    const badReq = new Request("http://localhost/api/admin/users/t1", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{not json" });
    const res = await patchUserResponse("t1", badReq, { getSuperAdmin: superAdmin as never });
    expect(res.status).toBe(400);
  });

  it("403s when the service raises a safeguard error", async () => {
    const setUserRoleFn = vi.fn(async () => { throw new SuperAdminProtectedError(); });
    const res = await patchUserResponse("t1", req({ role: "user" }), {
      getSuperAdmin: superAdmin as never,
      setUserRoleFn: setUserRoleFn as never,
    });
    expect(res.status).toBe(403);
  });

  it("403s on a self-action safeguard error", async () => {
    const setUserBlockedFn = vi.fn(async () => { throw new SelfActionError(); });
    const res = await patchUserResponse("s", req({ blocked: true }), {
      getSuperAdmin: superAdmin as never,
      setUserBlockedFn: setUserBlockedFn as never,
    });
    expect(res.status).toBe(403);
  });

  it("404s on an unknown user", async () => {
    const setUserRoleFn = vi.fn(async () => { throw new UserNotFoundError(); });
    const res = await patchUserResponse("nope", req({ role: "user" }), {
      getSuperAdmin: superAdmin as never,
      setUserRoleFn: setUserRoleFn as never,
    });
    expect(res.status).toBe(404);
  });
});
