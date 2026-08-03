import { describe, it, expect, vi } from "vitest";

// Wraps the real node:crypto so createUnverifiedUser's call to randomBytes can be
// observed directly — the point of the test below is to prove the placeholder
// password comes from randomBytes and not from a constant, and comparing two
// bcrypt hashes wouldn't prove that (bcrypt salts randomly regardless of input).
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

import { randomBytes } from "node:crypto";
import { createUser, createUnverifiedUser, getUserByEmail, getAuthUserById, markEmailVerified, DuplicateEmailError, normalizeEmail } from "@/lib/auth/users";

// Minimal fake matching the Drizzle calls used by the service.
function fakeDb(opts: { existing?: unknown[]; insertResult?: unknown[]; insertThrows?: unknown } = {}) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => opts.existing ?? [] }) }) }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (opts.insertThrows) throw opts.insertThrows;
          return opts.insertResult ?? [];
        },
      }),
    }),
  } as never;
}

describe("createUser", () => {
  it("inserts a user and returns the record without the hash", async () => {
    const db = fakeDb({ insertResult: [{ id: "u1", email: "a@b.com", role: "user" }] });
    const rec = await createUser({ email: "a@b.com", password: "secret123" }, db);
    expect(rec).toEqual({ id: "u1", email: "a@b.com", role: "user" });
    expect((rec as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it("maps a unique-violation to DuplicateEmailError", async () => {
    const pgUnique = Object.assign(new Error("dup"), { code: "23505" });
    const db = fakeDb({ insertThrows: pgUnique });
    await expect(createUser({ email: "a@b.com", password: "x" }, db)).rejects.toBeInstanceOf(DuplicateEmailError);
  });
});

describe("createUnverifiedUser", () => {
  it("creates the user via createUser and returns the record without the hash", async () => {
    const db = fakeDb({ insertResult: [{ id: "u1", email: "a@b.com", role: "user" }] });
    const rec = await createUnverifiedUser({ email: "a@b.com" }, db);
    expect(rec).toEqual({ id: "u1", email: "a@b.com", role: "user" });
  });

  // The placeholder must be unguessable — the row's password_hash is NOT NULL
  // and nothing may ever authenticate against it — so it has to come from
  // randomBytes, never a constant string. Asserting on the resulting bcrypt
  // hashes wouldn't prove this (bcrypt salts randomly on every call regardless
  // of input), so this asserts on the actual randomBytes(32) call instead.
  it("generates the placeholder password from randomBytes(32), not a constant", async () => {
    const db = fakeDb({ insertResult: [{ id: "u1", email: "a@b.com", role: "user" }] });
    vi.mocked(randomBytes).mockClear();
    await createUnverifiedUser({ email: "a@b.com" }, db);
    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it("maps a unique-violation to DuplicateEmailError, same as createUser", async () => {
    const pgUnique = Object.assign(new Error("dup"), { code: "23505" });
    const db = fakeDb({ insertThrows: pgUnique });
    await expect(createUnverifiedUser({ email: "a@b.com" }, db)).rejects.toBeInstanceOf(DuplicateEmailError);
  });
});

describe("getUserByEmail", () => {
  it("returns null when not found", async () => {
    expect(await getUserByEmail("none@b.com", fakeDb({ existing: [] }))).toBeNull();
  });
  it("returns the row including passwordHash when found", async () => {
    const db = fakeDb({ existing: [{ id: "u1", email: "a@b.com", role: "admin", passwordHash: "h" }] });
    expect(await getUserByEmail("a@b.com", db)).toMatchObject({ id: "u1", role: "admin", passwordHash: "h" });
  });
});

describe("markEmailVerified", () => {
  // Confirms a row reached by OAuth LINKING (oauthSignIn step 4b). The `set`
  // payload is what matters here: a real timestamp, and nothing else touched —
  // this must never become a way to change a role or clear a block.
  it("stamps emailVerifiedAt with a real timestamp and nothing else", async () => {
    const set = vi.fn(() => ({ where: async () => {} }));
    await markEmailVerified("u1", { update: () => ({ set }) } as never);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ emailVerifiedAt: expect.any(Date) });
  });
});

describe("getAuthUserById", () => {
  it("returns role, super-admin flag, and blocked timestamp", async () => {
    const row = { id: "u1", role: "admin", isSuperAdmin: true, blockedAt: null };
    const db = fakeDb({ existing: [row] });
    expect(await getAuthUserById("u1", db)).toEqual(row);
  });

  it("returns null when the user is absent", async () => {
    const db = fakeDb({ existing: [] });
    expect(await getAuthUserById("missing", db)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  John.Doe@Corp.COM ")).toBe("john.doe@corp.com");
  });
  it("leaves an already-normal address alone", () => {
    expect(normalizeEmail("john.doe@corp.com")).toBe("john.doe@corp.com");
  });
});

describe("case-insensitive addressing", () => {
  it("getUserByEmail queries the normalised address", async () => {
    const where = vi.fn(() => ({ limit: async () => [{ id: "u1" }] }));
    const database = { select: () => ({ from: () => ({ where }) }) } as never;
    await getUserByEmail("JOHN@CORP.COM", database);
    // drizzle builds an opaque SQL object (a real `eq()` call, not a mock), so we
    // assert on the value we fed it rather than on `where` being called with a
    // particular reference. Plain JSON.stringify throws here — drizzle's column
    // objects carry a `table` back-reference to the table they belong to, which
    // is circular (table.email.table === table) — so the replacer drops that key.
    // What's left still carries the bound parameter's actual value (the `Param`
    // chunk's `value` field), which is what distinguishes a normalised query from
    // an un-normalised one; a plain "does `where` get called" check would not.
    const serialized = JSON.stringify(where.mock.calls[0], (key, value) => (key === "table" ? undefined : value));
    expect(serialized).toContain("john@corp.com");
    expect(serialized).not.toContain("JOHN@CORP.COM");
  });

  it("createUser stores the normalised address", async () => {
    // The mock takes a parameter (even though it ignores it) so its `calls`
    // entries are typed as a one-element tuple, not `[]` — otherwise
    // `values.mock.calls[0][0]` below is a static index-out-of-bounds error
    // under this tsconfig's strict mode, not just a runtime `undefined`.
    const values = vi.fn((_row: unknown) => ({ returning: async () => [{ id: "u1", email: "john@corp.com", role: "user" }] }));
    const database = { insert: () => ({ values }) } as never;
    await createUser({ email: "John@Corp.com", password: "hunter2hunter2" }, database);
    expect(values.mock.calls[0][0]).toMatchObject({ email: "john@corp.com" });
  });
});
