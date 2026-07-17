import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createUser, getUserByEmail } from "@/lib/auth/users";
import { ensureDefaultWorkspace } from "@/lib/workspaces/ensure-default";
import { domainOf } from "@/lib/auth/seed-domains";
import { getAdminSettings, updateSettings } from "@/lib/config/settings-service";

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

  const existing = await getUserByEmail(email);
  if (existing) {
    // Ensure the env admin is the super-admin (and an admin), even if pre-existing.
    // The admin must be able to log in: the gate rejects a null emailVerifiedAt, and
    // an admin who cannot sign in cannot configure SMTP to fix it.
    await db.update(users).set({ role: "admin", isSuperAdmin: true, emailVerifiedAt: new Date() }).where(eq(users.email, email));
    console.log(`Admin ensured super-admin: ${email}.`);
    process.exit(0);
  }
  const user = await createUser({ email, password, role: "admin" });
  // Same reasoning as above: the admin must be able to log in immediately.
  await db.update(users).set({ isSuperAdmin: true, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  console.log(`Created super-admin: ${user.email}`);
  process.exit(0);
}

main();
