// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/guards";

// next/headers and next/navigation only exist inside a Next request; both are
// faked here. redirect() is faked to THROW, exactly as the real one does — a
// guard that called it and then kept going would otherwise look correct.
const redirect = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); });
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "authjs.session-token=x" }) }));

const requireUser = vi.fn();
vi.mock("@/lib/auth/guards", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/guards")>()),
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

const { requirePageUser, requirePageAdmin, requirePageSuperAdmin } = await import("./guards");

const ADMIN = { id: "u1", email: "a@corp.com", role: "admin" as const, isSuperAdmin: false };
const USER = { id: "u2", email: "u@corp.com", role: "user" as const, isSuperAdmin: false };

beforeEach(() => { redirect.mockClear(); requireUser.mockReset(); });

describe("page guards", () => {
  it("redirects to /login when the session is missing, expired or retired", async () => {
    requireUser.mockRejectedValue(new UnauthorizedError());
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  // requireUser itself never throws Forbidden today, but the guard's catch
  // treats it the same as Unauthorized ("not signed in"), so this locks that
  // in rather than leaving it as an untested branch.
  it("also redirects to /login on a Forbidden from requireUser", async () => {
    requireUser.mockRejectedValue(new ForbiddenError());
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects a signed-in non-admin away from an admin page", async () => {
    requireUser.mockResolvedValue(USER);
    await expect(requirePageAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("redirects an admin who is not a super-admin away from a super-admin page", async () => {
    requireUser.mockResolvedValue(ADMIN);
    await expect(requirePageSuperAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("returns the database-backed user to an authorised page", async () => {
    requireUser.mockResolvedValue(ADMIN);
    await expect(requirePageAdmin()).resolves.toEqual(ADMIN);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("passes the request's cookie header through to requireUser", async () => {
    requireUser.mockResolvedValue(ADMIN);
    await requirePageUser();
    const passed = requireUser.mock.calls[0][0] as Request;
    expect(passed.headers.get("cookie")).toBe("authjs.session-token=x");
  });

  // The one that matters most and is easiest to get wrong: a database outage
  // must be a 500, not a silent bounce to /login that reads as "signed out"
  // and loops. Only UnauthorizedError and ForbiddenError mean "not signed in".
  it("propagates a non-auth failure instead of redirecting", async () => {
    requireUser.mockRejectedValue(new Error("connection terminated"));
    await expect(requirePageUser()).rejects.toThrow("connection terminated");
    expect(redirect).not.toHaveBeenCalled();
  });
});
