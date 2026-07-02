import { describe, it, expect, vi } from "vitest";
import { authorizeCredentials } from "@/auth";

describe("authorizeCredentials", () => {
  it("returns null when fields are missing", async () => {
    expect(await authorizeCredentials({}, { lookup: vi.fn(), verify: vi.fn() })).toBeNull();
  });

  it("returns null when the user does not exist", async () => {
    const lookup = vi.fn(async () => null);
    expect(await authorizeCredentials({ email: "a@b.com", password: "x" }, { lookup, verify: vi.fn() })).toBeNull();
  });

  it("returns null when the password is wrong", async () => {
    const lookup = vi.fn(async () => ({ id: "u1", email: "a@b.com", role: "user", passwordHash: "h", blockedAt: null, isSuperAdmin: false }));
    const verify = vi.fn(async () => false);
    expect(await authorizeCredentials({ email: "a@b.com", password: "bad" }, { lookup, verify })).toBeNull();
  });

  it("returns the safe user on success", async () => {
    const lookup = vi.fn(async () => ({ id: "u1", email: "a@b.com", role: "admin", passwordHash: "h", blockedAt: null, isSuperAdmin: false }));
    const verify = vi.fn(async () => true);
    const user = await authorizeCredentials({ email: "a@b.com", password: "ok" }, { lookup, verify });
    expect(user).toEqual({ id: "u1", email: "a@b.com", role: "admin", isSuperAdmin: false });
  });

  it("rejects a blocked user even with correct credentials", async () => {
    const lookup = async () => ({ id: "u1", email: "e", role: "user", passwordHash: "h", blockedAt: new Date(), isSuperAdmin: false });
    const verify = async () => true;
    expect(await authorizeCredentials({ email: "e", password: "p" }, { lookup, verify })).toBeNull();
  });

  it("returns isSuperAdmin for an allowed user", async () => {
    const lookup = async () => ({ id: "u1", email: "e", role: "admin", passwordHash: "h", blockedAt: null, isSuperAdmin: true });
    const verify = async () => true;
    expect(await authorizeCredentials({ email: "e", password: "p" }, { lookup, verify })).toEqual({ id: "u1", email: "e", role: "admin", isSuperAdmin: true });
  });
});
