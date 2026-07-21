import { describe, it, expect, vi } from "vitest";
import { requireUser, requireAdmin, requireSuperAdmin, UnauthorizedError, ForbiddenError, errorToResponse } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";
import type { getAuthUserById } from "@/lib/auth/users";

// Dummy request: guards read the session via the injected getSession fake, so
// its contents never matter for these tests — only that a Request is passed.
const req = () => new Request("http://localhost/api/x");

const session = (role?: "admin" | "user") =>
  vi.fn(async () => (role ? { id: "u1", role, isSuperAdmin: false } : null)) as unknown as (
    request: Request,
  ) => Promise<SessionUser | null>;

const authUser = (over: Partial<{ role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: Date | null }> = {}) =>
  vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: null, ...over })) as unknown as typeof getAuthUserById;

describe("requireUser", () => {
  it("throws Unauthorized without a session", async () => {
    await expect(requireUser(req(), { getSession: session(undefined) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("returns the user when authenticated", async () => {
    expect(await requireUser(req(), { getSession: session("user"), getAuthUser: authUser() })).toEqual({ id: "u1", role: "user", isSuperAdmin: false });
  });
  it("throws Unauthorized when the user no longer exists", async () => {
    await expect(requireUser(req(), { getSession: session("user"), getAuthUser: (async () => null) as unknown as typeof getAuthUserById })).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("throws Unauthorized when the user is blocked", async () => {
    await expect(requireUser(req(), { getSession: session("user"), getAuthUser: authUser({ blockedAt: new Date() }) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requireAdmin", () => {
  it("throws Forbidden for a non-admin", async () => {
    await expect(requireAdmin(req(), { getSession: session("user"), getAuthUser: authUser() })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("returns the user for an admin", async () => {
    expect(await requireAdmin(req(), { getSession: session("admin"), getAuthUser: authUser({ role: "admin" }) })).toEqual({ id: "u1", role: "admin", isSuperAdmin: false });
  });
});

describe("requireSuperAdmin", () => {
  it("passes for a super-admin and forbids others", async () => {
    await expect(requireSuperAdmin(req(), { getSession: session("admin"), getAuthUser: authUser({ role: "admin", isSuperAdmin: true }) }))
      .resolves.toMatchObject({ isSuperAdmin: true });
    await expect(requireSuperAdmin(req(), { getSession: session("admin"), getAuthUser: authUser({ role: "admin", isSuperAdmin: false }) }))
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
