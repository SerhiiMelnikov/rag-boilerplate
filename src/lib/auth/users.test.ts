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
import { createUser, createUnverifiedUser, getUserByEmail, getAuthUserById, DuplicateEmailError } from "@/lib/auth/users";

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
