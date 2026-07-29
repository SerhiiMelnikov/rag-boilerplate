import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";

// One hour, deliberately shorter than verification's 24h (TOKEN_TTL_MS in
// verification.ts): a reset link is a live credential for an account that
// already exists and already holds data, whereas a verification link only ever
// unlocks an empty, unusable shell.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Prune at most this often, per process — same rationale as
// pruneAbandonedRegistrations: /api/auth/forgot-password is unauthenticated, so
// housekeeping must not run a DELETE on every single request.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneMs = 0;

// Test-only: the throttle above is module state, which would leak between tests.
export function __resetPasswordResetPruneThrottle(): void {
  lastPruneMs = 0;
}

export interface ResetDeps {
  database?: typeof defaultDb;
  now?: () => number;
  randomToken?: () => string;
}

// 32 random bytes: this is the only thing between a guesser and someone else's
// account, so it must not be guessable.
function defaultToken(): string {
  return randomBytes(32).toString("base64url");
}

// Drizzle's transaction object, derived from db.transaction's own callback
// signature rather than imported from drizzle internals — both call sites below
// pass the `tx` they were handed, and this is the exact type it has.
type Tx = Parameters<Parameters<typeof defaultDb.transaction>[0]>[0];

// The two writes that make a password change effective: the new hash, and a
// cut-off retiring every session token issued before this moment (see
// requireUser). Both callers below go through here so "invalidate" cannot come
// to mean two different things in two places.
//
// `scope` is the extra condition on the users row. Reset passes a scope; the
// authenticated change passes none, because requireUser has already established
// the caller is that user and is not blocked.
async function writeNewPassword(
  tx: Tx,
  userId: string,
  passwordHash: string,
  now: number,
  scope?: ReturnType<typeof and>,
): Promise<number> {
  const updated = await tx.update(users)
    .set({ passwordHash, sessionsValidFrom: new Date(now) })
    .where(scope ? and(eq(users.id, userId), scope) : eq(users.id, userId))
    .returning({ id: users.id });
  if (updated.length === 0) return 0;
  // Disarm EVERY outstanding reset link for this user, not just the one used.
  // This is what makes the defensive case work: "I got a reset email I did not
  // ask for, so I am changing my password right now" must leave the sender
  // holding nothing.
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  return updated.length;
}

export async function createPasswordResetToken(userId: string, deps: ResetDeps = {}): Promise<string> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const token = (deps.randomToken ?? defaultToken)();
  await database.insert(passwordResetTokens).values({
    token, userId, expiresAt: new Date(now + RESET_TOKEN_TTL_MS),
  });
  return token;
}

// Read-only existence + expiry check, for the GET that renders the "choose a new
// password" form. Deliberately does not touch the row: Outlook Safe Links and
// every corporate mail scanner fetch every URL in every email with no human
// involved, and any mutation here would let one of them destroy the user's only
// reset link before they read the mail.
export async function isPasswordResetTokenValid(token: string, deps: ResetDeps = {}): Promise<boolean> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const [row] = await database.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token)).limit(1);
  if (!row) return false;
  return row.expiresAt.getTime() > now;
}

// Consume the token the clicker landed on and set the password they chose.
// Returns false for unknown, expired, already-used, unverified and blocked
// alike — the caller must not be able to tell them apart, or it tells a
// token-guesser which guesses are close.
export async function consumePasswordResetToken(
  token: string,
  passwordHash: string,
  deps: ResetDeps = {},
): Promise<boolean> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();

  return database.transaction(async (tx) => {
    const [row] = await tx.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token)).limit(1);
    if (!row) return false;
    if (row.expiresAt.getTime() <= now) {
      // Expired tokens are dead weight; drop it rather than leave it to rot.
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
      return false;
    }

    // Scoped, and both halves are load-bearing:
    //  - emailVerifiedAt IS NOT NULL: an unverified row has no password worth
    //    resetting (its hash is random filler — see createUnverifiedUser), and
    //    letting a reset set one would be a second, unaudited way to claim an
    //    account that only the registration flow should be able to claim.
    //  - blockedAt IS NULL: a user blocked AFTER requesting the reset must not
    //    be able to complete it.
    const rows = await writeNewPassword(
      tx, row.userId, passwordHash, now,
      and(isNotNull(users.emailVerifiedAt), isNull(users.blockedAt)),
    );
    return rows > 0;
  });
}

// Used by the authenticated change-password endpoint. requireUser has already
// proved the caller is this user and is not blocked, so no extra scope.
export async function setPasswordAndInvalidateSessions(
  userId: string,
  passwordHash: string,
  deps: ResetDeps = {},
): Promise<void> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  await database.transaction(async (tx) => {
    await writeNewPassword(tx, userId, passwordHash, now);
  });
}

// Housekeeping, throttled per process. There is no user-deletion analogue to
// pruneAbandonedRegistrations here: reset tokens only ever belong to verified
// users, and a verified user is never swept.
export async function deleteExpiredPasswordResetTokens(deps: ResetDeps = {}): Promise<void> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  if (now - lastPruneMs < PRUNE_INTERVAL_MS) return;
  lastPruneMs = now;
  await database.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date(now)));
}
