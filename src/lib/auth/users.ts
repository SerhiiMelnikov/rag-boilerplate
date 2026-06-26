import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "./password";

export interface NewUser {
  email: string;
  password: string;
  role?: "admin" | "user";
}
export interface UserRecord {
  id: string;
  email: string;
  role: "admin" | "user";
}

// Thrown when inserting a user whose email already exists.
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = "DuplicateEmailError";
  }
}

// Create a user with a hashed password. Returns the public record (no hash).
export async function createUser(input: NewUser, database = defaultDb): Promise<UserRecord> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [row] = await database
      .insert(users)
      .values({ email: input.email, passwordHash, role: input.role ?? "user" })
      .returning({ id: users.id, email: users.email, role: users.role });
    return row;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      throw new DuplicateEmailError(input.email);
    }
    throw err;
  }
}

// Fetch a user by email, including the password hash (for credential verification).
export async function getUserByEmail(email: string, database = defaultDb) {
  const rows = await database
    .select({ id: users.id, email: users.email, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}
