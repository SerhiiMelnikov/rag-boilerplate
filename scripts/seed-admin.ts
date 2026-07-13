import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createUser, getUserByEmail } from "@/lib/auth/users";
import { ensureDefaultWorkspace } from "@/lib/workspaces/ensure-default";

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

  const existing = await getUserByEmail(email);
  if (existing) {
    // Ensure the env admin is the super-admin (and an admin), even if pre-existing.
    await db.update(users).set({ role: "admin", isSuperAdmin: true }).where(eq(users.email, email));
    console.log(`Admin ensured super-admin: ${email}.`);
    process.exit(0);
  }
  const user = await createUser({ email, password, role: "admin" });
  await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, user.id));
  console.log(`Created super-admin: ${user.email}`);
  process.exit(0);
}

main();
