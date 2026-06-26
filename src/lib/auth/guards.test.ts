import { describe, it, expect, vi } from "vitest";
import { requireUser, requireAdmin, UnauthorizedError, ForbiddenError, errorToResponse } from "@/lib/auth/guards";

const session = (role?: "admin" | "user") =>
  vi.fn(async () => (role ? { user: { id: "u1", role } } : null)) as any;

describe("requireUser", () => {
  it("throws Unauthorized without a session", async () => {
    await expect(requireUser({ getSession: session(undefined) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("returns the user when authenticated", async () => {
    expect(await requireUser({ getSession: session("user") })).toEqual({ id: "u1", role: "user" });
  });
});

describe("requireAdmin", () => {
  it("throws Forbidden for a non-admin", async () => {
    await expect(requireAdmin({ getSession: session("user") })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("returns the user for an admin", async () => {
    expect(await requireAdmin({ getSession: session("admin") })).toEqual({ id: "u1", role: "admin" });
  });
});

describe("errorToResponse", () => {
  it("maps Unauthorized to 401 and Forbidden to 403", async () => {
    expect(errorToResponse(new UnauthorizedError())?.status).toBe(401);
    expect(errorToResponse(new ForbiddenError())?.status).toBe(403);
    expect(errorToResponse(new Error("other"))).toBeNull();
  });
});
