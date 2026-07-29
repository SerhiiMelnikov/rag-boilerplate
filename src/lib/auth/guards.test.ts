import { describe, it, expect, vi } from "vitest";
import { requireUser, requireAdmin, requireSuperAdmin, UnauthorizedError, ForbiddenError, errorToResponse } from "@/lib/auth/guards";
import type { RequestSession } from "@/lib/auth/session";
import type { getAuthUserById } from "@/lib/auth/users";

// Dummy request: guards read the session via the injected getSession fake, so
// its contents never matter for these tests — only that a Request is passed.
const req = () => new Request("http://localhost/api/x");

// issuedAt is a fixed, arbitrary past instant: none of the tests using this
// factory exercise the cut-off (their getAuthUser mocks all carry
// sessionsValidFrom: null), so the actual value never matters — only that the
// field is present so the fixture keeps satisfying RequestSession.
const session = (role?: "admin" | "user") =>
  vi.fn(async () => (role ? { id: "u1", role, isSuperAdmin: false, issuedAt: 1_700_000_000 } : null)) as unknown as (
    request: Request,
  ) => Promise<RequestSession | null>;

const authUser = (over: Partial<{ role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: Date | null; sessionsValidFrom: Date | null }> = {}) =>
  vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: null, sessionsValidFrom: null, ...over })) as unknown as typeof getAuthUserById;

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

describe("requireUser session cut-off", () => {
  const NOW_S = 1_700_000_000;
  const req = new Request("http://test/api/whatever");

  const guard = (issuedAt: number | null, sessionsValidFrom: Date | null) => ({
    getSession: async () => ({ id: "u1", role: "user", isSuperAdmin: false, issuedAt }),
    getAuthUser: async () => ({ id: "u1", role: "user" as const, isSuperAdmin: false, blockedAt: null, sessionsValidFrom }),
  });

  it("accepts any token when the user has no cut-off", async () => {
    await expect(requireUser(req, guard(NOW_S - 999_999, null))).resolves.toMatchObject({ id: "u1" });
  });

  it("rejects a token issued one second before the cut-off", async () => {
    await expect(requireUser(req, guard(NOW_S - 1, new Date(NOW_S * 1000)))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  // The second-precision case, and the reason the comparison is >= against a
  // FLOORED cut-off rather than >. `iat` is whole seconds; sessions_valid_from
  // carries milliseconds. A reset at 10:00:00.700 followed by a login at
  // 10:00:00.900 mints a token whose iat floors to 10:00:00 — strictly LESS than
  // the raw cut-off. Under a strict comparison the legitimate token the user
  // receives immediately after resetting would be refused every single time.
  it("accepts a token issued in the same second as the cut-off", async () => {
    await expect(requireUser(req, guard(NOW_S, new Date(NOW_S * 1000 + 700)))).resolves.toMatchObject({ id: "u1" });
  });

  it("accepts a token issued after the cut-off", async () => {
    await expect(requireUser(req, guard(NOW_S + 5, new Date(NOW_S * 1000)))).resolves.toMatchObject({ id: "u1" });
  });

  // We cannot place an iat-less token relative to the cut-off, and defaulting to
  // "accept" would make the whole mechanism opt-out for anything that mints a
  // token without iat.
  it("rejects a token with no iat once a cut-off exists", async () => {
    await expect(requireUser(req, guard(null, new Date(NOW_S * 1000)))).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
