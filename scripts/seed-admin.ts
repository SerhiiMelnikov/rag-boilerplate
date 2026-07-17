import "dotenv/config";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createUser, getUserByEmail } from "@/lib/auth/users";
import { hashPassword } from "@/lib/auth/password";
import { ensureDefaultWorkspace } from "@/lib/workspaces/ensure-default";
import { domainOf } from "@/lib/auth/seed-domains";
import { getAdminSettings, updateSettings } from "@/lib/config/settings-service";

// Narrow injectable type, deliberately not `typeof getUserByEmail`: that
// function has no explicit return type annotation, so TS infers its `rows[0]
// ?? null` as always-non-null (the same inference trap findUserForRegistration's
// comment in src/lib/auth/users.ts documents) and drops the `| null` a test
// mock needs to return. ensureAdminUser only ever tests this for truthiness, so
// the id is all it needs.
type LookupFn = (email: string, database?: typeof defaultDb) => Promise<{ id: string } | null>;

export interface EnsureAdminDeps {
  database?: typeof defaultDb;
  getUserByEmailFn?: LookupFn;
  createUserFn?: typeof createUser;
  hashPasswordFn?: typeof hashPassword;
}

// Ensure ADMIN_EMAIL exists as a verified super-admin whose ADMIN_PASSWORD
// actually authenticates — including when the row already existed.
//
// seed:admin is an owner-only, env-driven bootstrap; its whole contract is
// "make ADMIN_EMAIL/ADMIN_PASSWORD work". That means it must be authoritative
// over the password on an existing row too, not just role/isSuperAdmin: an
// unverified registration (see createUnverifiedUser in src/lib/auth/users.ts)
// leaves password_hash set to a hash of 32 random bytes that nothing can ever
// authenticate against. Without overwriting it here, a squatter who registers
// (but never verifies) the operator's intended admin address would get
// promoted straight to verified super-admin by this script while
// ADMIN_PASSWORD silently still doesn't work — and the verify flow can't
// rescue it afterward either, since consumeVerificationToken only ever
// touches a row whose emailVerifiedAt is still null (see verification.ts).
// The same trap catches an ordinary admin who registers, forgets to click the
// link, and runs this script to "fix" it.
export async function ensureAdminUser(
  email: string,
  password: string,
  deps: EnsureAdminDeps = {},
): Promise<"updated" | "created"> {
  const database = deps.database ?? defaultDb;
  const getUserByEmailFn = deps.getUserByEmailFn ?? getUserByEmail;
  const createUserFn = deps.createUserFn ?? createUser;
  const hashPasswordFn = deps.hashPasswordFn ?? hashPassword;

  const existing = await getUserByEmailFn(email, database);
  if (existing) {
    const passwordHash = await hashPasswordFn(password);
    await database
      .update(users)
      .set({ role: "admin", isSuperAdmin: true, emailVerifiedAt: new Date(), passwordHash })
      .where(eq(users.email, email));
    return "updated";
  }

  const user = await createUserFn({ email, password, role: "admin" }, database);
  // Same reasoning as above: the admin must be able to log in immediately.
  await database.update(users).set({ isSuperAdmin: true, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  return "created";
}

// Idempotently create the admin user and the default workspace from environment
// variables. Both are prerequisites for a usable install: every workspace lookup
// resolves through the default (General) workspace.
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.");
    process.exit(1);
  }

  // Before the admin, and before any early exit below: a project scaffolded onto a
  // non-pgvector store builds its schema with `db:generate` (DDL only), so this is
  // the only thing that creates General there.
  await ensureDefaultWorkspace();
  console.log("Default workspace ensured: General.");

  // Before any early exit below, for the same reason as the workspace above: a
  // re-run against an already-seeded admin must still land these.
  //
  // An empty allowlist denies every registration, so a fresh install would be a
  // dead end. Seed it from the admin's own domain; the admin can widen it in the
  // UI. Only seed when it is still empty — never clobber an admin's edit.
  // getAdminSettings() lazily inserts the singleton settings row if it does not
  // exist yet, so calling it here (rather than a raw select) also bootstraps it.
  const domain = domainOf(email);
  if (domain) {
    const current = await getAdminSettings();
    if (current.allowedEmailDomains.trim() === "") {
      await updateSettings({ allowedEmailDomains: domain });
      console.log(`Registration allowlist seeded: ${domain}`);
    }
  }

  const outcome = await ensureAdminUser(email, password);
  console.log(outcome === "updated" ? `Admin ensured super-admin: ${email}.` : `Created super-admin: ${email}`);
  process.exit(0);
}

// Only run when executed directly (`tsx scripts/seed-admin.ts`), not when
// imported — e.g. by seed-admin.test.ts, which needs `ensureAdminUser` without
// triggering a real run (and its `process.exit` calls) as an import side effect.
if (process.argv[1] === import.meta.filename) main();
