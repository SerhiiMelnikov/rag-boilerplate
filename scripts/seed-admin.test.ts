import { describe, it, expect } from "vitest";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { ensureAdminUser } from "./seed-admin";

// Fake db modelling a single users row, mutated only through the exact
// update(...).set(...).where(...) shape ensureAdminUser uses.
function fakeDbWithRow(row: {
  id: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  isSuperAdmin: boolean;
  emailVerifiedAt: Date | null;
}) {
  let current = { ...row };
  const db = {
    update: () => ({
      set: (patch: Partial<typeof current>) => ({
        where: async () => {
          current = { ...current, ...patch };
        },
      }),
    }),
  };
  return { db: db as never, getCurrent: () => current };
}

describe("ensureAdminUser", () => {
  // The review finding, made concrete: a squatter registers ADMIN_EMAIL
  // (leaving the random-placeholder password_hash createUnverifiedUser sets —
  // see src/lib/auth/users.ts), and the owner then runs seed:admin with
  // ADMIN_EMAIL/ADMIN_PASSWORD to bootstrap their admin account. Without
  // overwriting password_hash on the existing-row branch, the script reports
  // success ("Admin ensured super-admin") while ADMIN_PASSWORD silently never
  // works — a verified super-admin nobody can log into, unrescuable by the
  // verify flow (it only ever touches a row with emailVerifiedAt IS NULL).
  //
  // To confirm this is not vacuous: remove `passwordHash` from the `.set(...)`
  // call in ensureAdminUser's existing-row branch and re-run this file — this
  // test must fail (the final assertion, ADMIN_PASSWORD authenticating against
  // the resulting hash, would no longer hold).
  it("squat-then-seed: makes ADMIN_PASSWORD work even though the row already existed with an unrelated hash", async () => {
    const squatterPlaceholderHash = await hashPassword("32-random-bytes-nobody-will-ever-guess");
    const { db, getCurrent } = fakeDbWithRow({
      id: "u1",
      email: "boss@company.com",
      passwordHash: squatterPlaceholderHash,
      role: "user",
      isSuperAdmin: false,
      emailVerifiedAt: null,
    });

    const outcome = await ensureAdminUser("boss@company.com", "the-real-admin-password", {
      database: db,
      getUserByEmailFn: async (email: string) => {
        const row = getCurrent();
        return row.email === email ? { ...row, blockedAt: null } : null;
      },
      createUserFn: async () => {
        throw new Error("must not create a new row — the row already existed");
      },
    });

    expect(outcome).toBe("updated");
    const row = getCurrent();
    expect(row.role).toBe("admin");
    expect(row.isSuperAdmin).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();

    // The actual bug: ADMIN_PASSWORD must now authenticate for real.
    await expect(verifyPassword("the-real-admin-password", row.passwordHash)).resolves.toBe(true);
    // And the squatter's placeholder must be gone — nothing about it should
    // still authenticate anything.
    await expect(verifyPassword("the-real-admin-password", squatterPlaceholderHash)).resolves.toBe(false);
  });

  it("creates a fresh verified super-admin when no row exists yet", async () => {
    const updates: Array<{ patch: unknown }> = [];
    const db = {
      update: () => ({
        set: (patch: unknown) => ({
          where: async () => {
            updates.push({ patch });
          },
        }),
      }),
    };

    const outcome = await ensureAdminUser("fresh@company.com", "pw", {
      database: db as never,
      getUserByEmailFn: async () => null,
      createUserFn: async (input) => ({ id: "new-id", email: input.email, role: input.role ?? "user" }),
    });

    expect(outcome).toBe("created");
    expect(updates).toEqual([{ patch: { isSuperAdmin: true, emailVerifiedAt: expect.any(Date) } }]);
  });
});
