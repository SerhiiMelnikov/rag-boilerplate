import { describe, it, expect, beforeEach } from "vitest";
import {
  RESET_TOKEN_TTL_MS,
  createPasswordResetToken,
  isPasswordResetTokenValid,
  deleteExpiredPasswordResetTokens,
  __resetPasswordResetPruneThrottle,
} from "./password-reset";

// A minimal fake: enough to observe what the module writes and reads, no more.
// The WHERE-clause scoping that actually matters is proven against real
// Postgres in password-reset.integration.test.ts — see the note there.
function fakeDb(row?: { token: string; userId: string; expiresAt: Date }) {
  const inserted: Array<Record<string, unknown>> = [];
  const deletes: unknown[] = [];
  return {
    inserted,
    deletes,
    insert: () => ({ values: async (v: Record<string, unknown>) => { inserted.push(v); } }),
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }),
    }),
    delete: () => ({ where: async (w: unknown) => { deletes.push(w); } }),
  };
}

const asDb = (f: ReturnType<typeof fakeDb>) => f as unknown as never;

describe("createPasswordResetToken", () => {
  it("stores the token with an expiry exactly one hour out", async () => {
    const f = fakeDb();
    const now = 1_700_000_000_000;
    const token = await createPasswordResetToken("user-1", {
      database: asDb(f), now: () => now, randomToken: () => "tok-abc",
    });
    expect(token).toBe("tok-abc");
    expect(f.inserted).toEqual([
      { token: "tok-abc", userId: "user-1", expiresAt: new Date(now + 3_600_000) },
    ]);
    expect(RESET_TOKEN_TTL_MS).toBe(3_600_000);
  });

  // A guessable token is the whole attack. 32 bytes of base64url is ~43 chars.
  it("defaults to a long random token, never a predictable one", async () => {
    const f = fakeDb();
    await createPasswordResetToken("user-1", { database: asDb(f) });
    const a = f.inserted[0].token as string;
    await createPasswordResetToken("user-1", { database: asDb(f) });
    const b = f.inserted[1].token as string;
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("isPasswordResetTokenValid", () => {
  const now = 1_700_000_000_000;
  const row = (expiresAt: Date) => ({ token: "tok", userId: "user-1", expiresAt });

  it("accepts a token one millisecond before it expires", async () => {
    const f = fakeDb(row(new Date(now + 1)));
    expect(await isPasswordResetTokenValid("tok", { database: asDb(f), now: () => now })).toBe(true);
  });

  // Boundary: expiry is exclusive. A token whose expiresAt is exactly now is dead.
  it("rejects a token at the exact instant it expires", async () => {
    const f = fakeDb(row(new Date(now)));
    expect(await isPasswordResetTokenValid("tok", { database: asDb(f), now: () => now })).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const f = fakeDb();
    expect(await isPasswordResetTokenValid("nope", { database: asDb(f), now: () => now })).toBe(false);
  });

  // Outlook Safe Links and corporate mail scanners GET every URL in every email
  // with no human involved. If this mutated the row, a scanner would burn the
  // user's only reset link before they ever opened the mail.
  it("never writes to the database", async () => {
    const f = fakeDb(row(new Date(now + 1000)));
    await isPasswordResetTokenValid("tok", { database: asDb(f), now: () => now });
    expect(f.inserted).toHaveLength(0);
    expect(f.deletes).toHaveLength(0);
  });
});

describe("deleteExpiredPasswordResetTokens", () => {
  beforeEach(() => { __resetPasswordResetPruneThrottle(); });

  it("sweeps once, then throttles for an hour", async () => {
    const f = fakeDb();
    const t0 = 1_700_000_000_000;
    await deleteExpiredPasswordResetTokens({ database: asDb(f), now: () => t0 });
    await deleteExpiredPasswordResetTokens({ database: asDb(f), now: () => t0 + 60_000 });
    expect(f.deletes).toHaveLength(1);
    await deleteExpiredPasswordResetTokens({ database: asDb(f), now: () => t0 + 3_600_001 });
    expect(f.deletes).toHaveLength(2);
  });
});
