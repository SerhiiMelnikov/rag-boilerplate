import { describe, it, expect, vi } from "vitest";
import { oauthSignIn, OAUTH_ERRORS } from "./signin";
import type { OAuthUser } from "./providers";

const base: OAuthUser = { id: "provider-sub-123", email: "person@company.com", name: "P", image: null, emailVerified: true, role: "user", isSuperAdmin: false };

type Row = { id: string; role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: Date | null } | null;

function deps(row: Row) {
  return {
    getSettingsFn: vi.fn(async () => ({ allowedEmailDomains: "company.com" })),
    findUserFn: vi.fn(async () => row),
    createUserFn: vi.fn(async () => ({ id: "new-uuid", role: "user" as const, isSuperAdmin: false })),
  };
}

describe("oauthSignIn refusals", () => {
  it("refuses a profile with no email", async () => {
    const d = deps(null);
    expect(await oauthSignIn({ ...base, email: null }, d)).toBe(OAUTH_ERRORS.unverified);
    expect(d.createUserFn).not.toHaveBeenCalled();
  });

  // Google reports email_verified; our GitHub userinfo request supplies an
  // address only when it is primary AND verified. Anything else cannot be
  // trusted to link to an existing account.
  it("refuses an unverified email", async () => {
    const d = deps(null);
    expect(await oauthSignIn({ ...base, emailVerified: false }, d)).toBe(OAUTH_ERRORS.unverified);
    expect(d.createUserFn).not.toHaveBeenCalled();
  });

  it("refuses a domain outside the allowlist", async () => {
    const d = deps(null);
    expect(await oauthSignIn({ ...base, email: "someone@elsewhere.test" }, d)).toBe(OAUTH_ERRORS.domain);
  });

  // The ordering case. Reversed, a disallowed domain would leave a row squatting
  // the address against a legitimate registration.
  it("creates nothing when the domain check refuses", async () => {
    const d = deps(null);
    await oauthSignIn({ ...base, email: "someone@elsewhere.test" }, d);
    expect(d.createUserFn).not.toHaveBeenCalled();
  });

  it("refuses a blocked account", async () => {
    const d = deps({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: new Date() });
    expect(await oauthSignIn({ ...base }, d)).toBe(OAUTH_ERRORS.blocked);
  });

  it("gives each refusal its own reason", () => {
    const codes = Object.values(OAUTH_ERRORS);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("oauthSignIn success", () => {
  it("links to an existing row and replaces the provider id with ours", async () => {
    const d = deps({ id: "existing-uuid", role: "admin", isSuperAdmin: true, blockedAt: null });
    const user = { ...base };
    expect(await oauthSignIn(user, d)).toBe(true);
    expect(d.createUserFn).not.toHaveBeenCalled();
    // The mutation IS the interface to the jwt callback — see the module comment.
    expect(user.id).toBe("existing-uuid");
    expect((user as Record<string, unknown>).role).toBe("admin");
    expect((user as Record<string, unknown>).isSuperAdmin).toBe(true);
  });

  it("creates a row when the address is new, and carries its id", async () => {
    const d = deps(null);
    const user = { ...base };
    expect(await oauthSignIn(user, d)).toBe(true);
    expect(d.createUserFn).toHaveBeenCalledWith("person@company.com");
    expect(user.id).toBe("new-uuid");
    expect((user as Record<string, unknown>).role).toBe("user");
  });
});
