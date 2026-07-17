import { and, eq, isNull, lt, notExists } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { emailVerificationTokens, users } from "@/lib/db/schema";

export interface PruneDeps {
  database?: typeof defaultDb;
  now?: () => number;
}

// Prune at most this often, per process — same rationale as
// src/lib/ratelimit/store.ts's own throttle: /api/register is unauthenticated and
// hot, so housekeeping must not run two DELETEs on every single request.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPruneMs = 0;

// Test-only: the throttle above is module state, which would leak between tests.
export function __resetRegistrationPruneThrottle(): void {
  lastPruneMs = 0;
}

// Delete expired verification tokens, and any unverified user left holding no
// live token as a result.
//
// An unverified user with zero remaining tokens is an abandoned registration:
// every link ever sent to that address has expired, and nobody is coming back to
// claim it, yet the row still holds the address hostage against a real
// registration (registerUser's "resend, don't squat" branch only fires for a
// user row that already exists). Deleting it frees the address.
//
// A verified user is never touched, regardless of how many token rows it has —
// consumeVerificationToken deletes every token for a user the instant it
// verifies them, so "zero tokens" is the NORMAL steady state for a verified
// user, not a sign of abandonment. The `isNull(users.emailVerifiedAt)` guard is
// what tells the two cases apart.
//
// Order matters: tokens are deleted first, so "no live token" for the users
// query below means exactly that — a token that hasn't expired yet is never
// mistaken for an abandoned one just because it's about to be swept next hour.
export async function pruneAbandonedRegistrations(deps: PruneDeps = {}): Promise<void> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  if (now - lastPruneMs < PRUNE_INTERVAL_MS) return;
  lastPruneMs = now;

  await database.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, new Date(now)));
  await database.delete(users).where(
    and(
      isNull(users.emailVerifiedAt),
      notExists(database.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, users.id))),
    ),
  );
}
