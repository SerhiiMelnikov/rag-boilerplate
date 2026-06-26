import "dotenv/config";
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
    console.log(`Admin already exists: ${email} (role: ${existing.role}).`);
    process.exit(0);
  }
  const user = await createUser({ email, password, role: "admin" });
  console.log(`Created admin: ${user.email}`);
  process.exit(0);
}

main();
