import { describe, it, expect } from "vitest";
import { Column, Param } from "drizzle-orm";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { ensureAdminUser } from "./seed-admin";

// Models `where` the way real drizzle `eq()` actually builds it (an `SQL`
// object holding `queryChunks`), not a plain object the fake could apply
// unconditionally. That distinction is the whole review finding: a fake that
// swallows `.where()` cannot tell "matched the row" from "silently matched
// zero rows", which is exactly what `.where(eq(users.email, email))` does
// against a row migration 0020 already lower-cased, when `email` is the raw
// (mixed-case) ADMIN_EMAIL. `Column`/`Param` are drizzle-orm's own public
// classes (exported from the package index), so this can walk a bare `eq()`
// condition and read the real column name + bound value.
function extractEq(node: unknown): { column: string; value: string } {
  const n = node as { queryChunks?: unknown[] } | undefined;
  const col = n?.queryChunks?.find((c): c is InstanceType<typeof Column> => c instanceof Column);
  const param = n?.queryChunks?.find((c): c is InstanceType<typeof Param> => c instanceof Param);
  if (!col || !param) throw new Error("fake db: expected a bare eq() filter on the users update");
  return { column: col.name, value: String(param.value) };
}

// Fake db modelling a single users row, mutated only when the captured WHERE
// condition actually matches the row's current id/email. The email compare is
// case-sensitive on purpose: `users.email` is a plain `text` column (see
// src/lib/db/schema.ts), not `citext`, so a real database is exactly this
// unforgiving about case too.
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
        where: async (w: unknown) => {
          const { column, value } = extractEq(w);
          const matches = column === "id" ? value === current.id : column === "email" ? value === current.email : false;
          if (matches) current = { ...current, ...patch };
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

  // The review finding, made concrete: migration 0020 already lower-cased this
  // row, but ADMIN_EMAIL keeps whatever case the operator typed (e.g.
  // `Boss@Company.com`). getUserByEmail normalises its own lookup and finds the
  // row regardless of case — but the existing-row branch then updates with
  // `.where(eq(users.email, email))` using the RAW ADMIN_EMAIL, and `users.email`
  // is a case-sensitive `text` column. That WHERE matches zero rows: no
  // password, no role, no isSuperAdmin — yet the caller still gets "updated"
  // back and the script prints success. This is the squat-then-seed lockout
  // the file's own comment warns about, triggered by case alone, with no
  // squatter required.
  //
  // To confirm this is not vacuous: change ensureAdminUser's existing-row
  // `.where()` back to `eq(users.email, email)` and re-run this file — this
  // test must fail (fakeDbWithRow's `where` only applies a patch when the
  // condition actually matches the row's CURRENT email/id, so a mismatched-case
  // email leaves role/isSuperAdmin/passwordHash exactly as seeded).
  it("mixed-case ADMIN_EMAIL still updates a row migration 0020 already lower-cased", async () => {
    const { db, getCurrent } = fakeDbWithRow({
      id: "u1",
      email: "boss@company.com", // already lower-cased by migration 0020
      passwordHash: await hashPassword("old-password"),
      role: "user",
      isSuperAdmin: false,
      emailVerifiedAt: null,
    });

    const outcome = await ensureAdminUser("Boss@Company.com", "the-real-admin-password", {
      database: db,
      // Models getUserByEmail's normalised lookup: finds the row regardless of case.
      getUserByEmailFn: async (email: string) => {
        const row = getCurrent();
        return row.email === email.trim().toLowerCase() ? { ...row } : null;
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
    await expect(verifyPassword("the-real-admin-password", row.passwordHash)).resolves.toBe(true);
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
