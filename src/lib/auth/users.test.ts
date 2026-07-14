import { describe, it, expect } from "vitest";
import { createUser, getUserByEmail, getAuthUserById, DuplicateEmailError } from "@/lib/auth/users";

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
