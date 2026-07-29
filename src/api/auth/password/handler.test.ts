import { describe, it, expect, vi } from "vitest";
import { changePassword } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const req = (body: unknown) =>
  new Request("http://test/api/auth/password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

// No overrides parameter: a `Record<string, unknown>` spread would widen every
// field to `unknown` and stop the result satisfying ChangePasswordDeps. Variants
// are built with `{ ...deps(), someFn: ... }` at the call site instead.
function deps() {
  return {
    requireUserFn: vi.fn(async () => ({ id: "u1", role: "user" as const, isSuperAdmin: false })),
    lookupFn: vi.fn(async () => ({ id: "u1", passwordHash: "stored-hash" }) as { id: string; passwordHash: string } | null),
    verifyFn: vi.fn(async (plain: string) => plain === "current-password"),
    hashPasswordFn: vi.fn(async (pw: string) => `hashed:${pw}`),
    setPasswordFn: vi.fn(async () => {}),
    encodeTokenFn: vi.fn(async () => "fresh-token"),
  };
}

const good = { currentPassword: "current-password", newPassword: "brand-new-password" };

describe("changePassword", () => {
  it("stores the new hash and hands back a fresh token", async () => {
    const d = deps();
    const res = await changePassword(req(good), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "fresh-token" });
    expect(d.setPasswordFn).toHaveBeenCalledWith("u1", "hashed:brand-new-password");
    // The caller's own session is among those this invalidates, so the token it
    // gets back must be minted AFTER the cut-off, not before.
    expect(d.encodeTokenFn.mock.invocationCallOrder[0])
      .toBeGreaterThan(d.setPasswordFn.mock.invocationCallOrder[0]);
  });

  it("returns 401 without a session", async () => {
    const d = { ...deps(), requireUserFn: vi.fn(async (): Promise<never> => { throw new UnauthorizedError(); }) };
    const res = await changePassword(req(good), d);
    expect(res.status).toBe(401);
    expect(d.setPasswordFn).not.toHaveBeenCalled();
  });

  // Re-proving the current password is what stops a stolen-token holder from
  // locking the real owner out of their own account.
  it("refuses a wrong current password and changes nothing", async () => {
    const d = deps();
    const res = await changePassword(req({ ...good, currentPassword: "wrong" }), d);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid credentials" });
    expect(d.setPasswordFn).not.toHaveBeenCalled();
  });

  it("refuses a new password shorter than 8 characters", async () => {
    const d = deps();
    const res = await changePassword(req({ ...good, newPassword: "short" }), d);
    expect(res.status).toBe(400);
    expect(d.setPasswordFn).not.toHaveBeenCalled();
  });

  // Validation must run BEFORE the expensive bcrypt verify.
  it("rejects a malformed body without hashing anything", async () => {
    const d = deps();
    const res = await changePassword(
      new Request("http://test/api/auth/password", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
      }), d);
    expect(res.status).toBe(400);
    expect(d.verifyFn).not.toHaveBeenCalled();
  });

  it("returns 401 when the session points at a user that no longer exists", async () => {
    const d = { ...deps(), lookupFn: vi.fn(async () => null) };
    const res = await changePassword(req(good), d);
    expect(res.status).toBe(401);
    expect(d.setPasswordFn).not.toHaveBeenCalled();
  });
});
