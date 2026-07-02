import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createUser, getUserByEmail } from "@/lib/auth/users";

// Idempotently create the admin user from environment variables.
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.");
    process.exit(1);
  }
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
