import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "./password";

// Minimal projection for the registration path: is this address taken, and is it
// confirmed?
//
// Explicit return type is required here (not just style): without it, TS infers
// `row`'s destructured type as non-nullable (this tsconfig has no
// noUncheckedIndexedAccess), which makes it treat the `?? null` fallback as
// unreachable and infers the return type as non-null — silently dropping the
// `| null` that callers (and RegisterDeps, which types against
// `typeof findUserForRegistration`) depend on.
export async function findUserForRegistration(
  email: string,
  database = defaultDb,
): Promise<{ id: string; emailVerifiedAt: Date | null } | null> {
  const [row] = await database
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function deleteUser(userId: string, database = defaultDb): Promise<void> {
  await database.delete(users).where(eq(users.id, userId));
}

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

export interface NewUnverifiedUser {
  email: string;
  role?: "admin" | "user";
}

// Registration (verified mode) no longer supplies a password — it is chosen by
// whoever clicks the verification link, and consumeVerificationToken overwrites
// this the moment they do. Until then the row needs SOME password_hash (the
// column is NOT NULL) that nothing can ever authenticate against, so it is a
// hash of 32 random bytes — never a constant, which would be a shared backdoor
// across every unverified row. emailVerifiedAt is left null by createUser as-is,
// which is exactly the "unverified" state this row should start in.
export async function createUnverifiedUser(input: NewUnverifiedUser, database = defaultDb): Promise<UserRecord> {
  const placeholder = randomBytes(32).toString("base64url");
  return createUser({ email: input.email, password: placeholder, role: input.role }, database);
}

// Fetch a user by email, including the password hash (for credential verification).
export async function getUserByEmail(email: string, database = defaultDb) {
  const rows = await database
    .select({ id: users.id, email: users.email, role: users.role, passwordHash: users.passwordHash, blockedAt: users.blockedAt, isSuperAdmin: users.isSuperAdmin, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

// One indexed lookup used by the guards (exists + not blocked + role + super-admin).
export async function getAuthUserById(id: string, database = defaultDb) {
  const rows = await database
    .select({ id: users.id, role: users.role, isSuperAdmin: users.isSuperAdmin, blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}
