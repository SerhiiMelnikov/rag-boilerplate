import { describe, it, expect, vi } from "vitest";
import { requireUser, requireAdmin, requireSuperAdmin, UnauthorizedError, ForbiddenError, errorToResponse } from "@/lib/auth/guards";

const session = (role?: "admin" | "user") =>
  vi.fn(async () => (role ? { user: { id: "u1", role } } : null)) as any;

const authUser = (over: Partial<{ role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: Date | null }> = {}) =>
  vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: null, ...over })) as any;

describe("requireUser", () => {
  it("throws Unauthorized without a session", async () => {
    await expect(requireUser({ getSession: session(undefined) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("returns the user when authenticated", async () => {
    expect(await requireUser({ getSession: session("user"), getAuthUser: authUser() })).toEqual({ id: "u1", role: "user", isSuperAdmin: false });
  });
  it("throws Unauthorized when the user no longer exists", async () => {
    await expect(requireUser({ getSession: session("user"), getAuthUser: (async () => null) as any })).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("throws Unauthorized when the user is blocked", async () => {
    await expect(requireUser({ getSession: session("user"), getAuthUser: authUser({ blockedAt: new Date() }) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requireAdmin", () => {
  it("throws Forbidden for a non-admin", async () => {
    await expect(requireAdmin({ getSession: session("user"), getAuthUser: authUser() })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("returns the user for an admin", async () => {
    expect(await requireAdmin({ getSession: session("admin"), getAuthUser: authUser({ role: "admin" }) })).toEqual({ id: "u1", role: "admin", isSuperAdmin: false });
  });
});

describe("requireSuperAdmin", () => {
  it("passes for a super-admin and forbids others", async () => {
    await expect(requireSuperAdmin({ getSession: session("admin"), getAuthUser: authUser({ role: "admin", isSuperAdmin: true }) }))
      .resolves.toMatchObject({ isSuperAdmin: true });
    await expect(requireSuperAdmin({ getSession: session("admin"), getAuthUser: authUser({ role: "admin", isSuperAdmin: false }) }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("errorToResponse", () => {
  it("maps Unauthorized to 401 and Forbidden to 403", async () => {
    expect(errorToResponse(new UnauthorizedError())?.status).toBe(401);
    expect(errorToResponse(new ForbiddenError())?.status).toBe(403);
    expect(errorToResponse(new Error("other"))).toBeNull();
  });
});
