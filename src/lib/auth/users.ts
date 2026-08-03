import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
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

// Minimal projection for the reset path: does this address exist, is it
// confirmed, and is it blocked?
//
// The explicit return type is required, not stylistic — see
// findUserForRegistration's comment: without it TS infers the destructured row
// as non-nullable and silently drops the `| null` that ForgotPasswordDeps
// depends on.
export async function findUserForReset(
  email: string,
  database = defaultDb,
): Promise<{ id: string; emailVerifiedAt: Date | null; blockedAt: Date | null } | null> {
  const [row] = await database
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, blockedAt: users.blockedAt })
    .from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
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

// An OAuth sign-in has already proved control of the mailbox, so the row is
// created verified — there is no link to send and nothing left to confirm.
// The password_hash column is NOT NULL and this account has no password, so it
// gets a hash of 32 random bytes: never a constant, which would be a shared
// backdoor across every OAuth row. The user can later set a real password
// through the reset flow and end up with both sign-in routes.
export async function createVerifiedOAuthUser(
  email: string,
  database = defaultDb,
): Promise<{ id: string; role: "admin" | "user"; isSuperAdmin: boolean }> {
  const placeholder = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(placeholder);
  const [row] = await database
    .insert(users)
    .values({ email, passwordHash, role: "user", emailVerifiedAt: new Date() })
    .returning({ id: users.id, role: users.role, isSuperAdmin: users.isSuperAdmin });
  return row;
}

// Confirm an existing row's address. An OAuth provider asserting a verified
// address is the same evidence a clicked verification link carries, so a row
// reached by LINKING (not creation) must be marked verified too — see
// oauthSignIn's step 4b.
//
// Leaving it null is not cosmetic: pruneAbandonedRegistrations deletes exactly
// that row 24 hours later (email_verified_at IS NULL, older than the token TTL,
// no token left), and users.id cascades to conversations and user_workspaces.
// The same null also makes authorizeCredentials refuse the account forever and
// forgot-password silently no-op on it, so its owner could never set a password.
//
// Scoped to `email_verified_at IS NULL`, mirroring consumeVerificationToken: a
// repeat sign-in must never churn a timestamp that already records when the
// address was first confirmed.
export async function markEmailVerified(userId: string, database = defaultDb): Promise<void> {
  await database
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
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

// Fetch a user's hash by id. getUserByEmail is keyed by email; the session
// carries only an id, so the authenticated change-password path needs this.
// Explicit return type for the same reason findUserForRegistration documents.
export async function getUserWithHashById(
  id: string,
  database = defaultDb,
): Promise<{ id: string; passwordHash: string } | null> {
  const [row] = await database
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// One indexed lookup used by the guards (exists + not blocked + role + super-admin).
export async function getAuthUserById(id: string, database = defaultDb) {
  const rows = await database
    .select({
      id: users.id, email: users.email, role: users.role, isSuperAdmin: users.isSuperAdmin,
      blockedAt: users.blockedAt, sessionsValidFrom: users.sessionsValidFrom,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}
