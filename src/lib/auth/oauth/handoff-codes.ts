import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { oauthHandoffCodes } from "@/lib/db/schema";

// Sixty seconds: two redirects and one fetch. This is a handoff, not a session.
export const HANDOFF_CODE_TTL_MS = 60 * 1000;

// Same per-process throttle as deleteExpiredPasswordResetTokens, for the same
// reason: the endpoint that fires it is unauthenticated and must not run a
// DELETE on every request.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneMs = 0;

// Test-only: the throttle above is module state, which would leak between tests.
export function __resetHandoffPruneThrottle(): void {
  lastPruneMs = 0;
}

export interface HandoffDeps {
  database?: typeof defaultDb;
  now?: () => number;
  randomToken?: () => string;
}

// This value travels in a query string. 32 random bytes so guessing it is not a
// way to obtain someone else's session.
function defaultCode(): string {
  return randomBytes(32).toString("base64url");
}

export async function createHandoffCode(userId: string, deps: HandoffDeps = {}): Promise<string> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const code = (deps.randomToken ?? defaultCode)();
  await database.insert(oauthHandoffCodes).values({
    code, userId, expiresAt: new Date(now + HANDOFF_CODE_TTL_MS),
  });
  return code;
}

// Returns the user id, or null for unknown, expired and already-used alike —
// the caller must not be able to tell them apart.
//
// The DELETE is the sole read, deliberately. A SELECT under READ COMMITTED
// (this repo's default — src/lib/db/client.ts sets no isolation-level
// override) takes no row lock, so two concurrent redemptions of one code
// could both see the row via a SELECT-then-DELETE, both proceed, and both
// return the same user id: one code, two sessions, which is precisely what
// single-use exists to prevent. DELETE ... RETURNING is atomic per row: only
// one caller can receive it. Same reasoning as the atomic upsert in
// src/lib/ratelimit/store.ts ("Postgres serialises concurrent writers on the
// row... Any read-then-write version of this would race").
//
// The row still goes whether or not it was live: a used code and an expired
// code are both dead weight, and leaving an expired one behind invites a
// replay if the expiry check is ever weakened.
export async function consumeHandoffCode(code: string, deps: HandoffDeps = {}): Promise<string | null> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();

  return database.transaction(async (tx) => {
    const [row] = await tx.delete(oauthHandoffCodes)
      .where(eq(oauthHandoffCodes.code, code))
      .returning();
    if (!row) return null;
    if (row.expiresAt.getTime() <= now) return null;
    return row.userId;
  });
}

export async function deleteExpiredHandoffCodes(deps: HandoffDeps = {}): Promise<void> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  if (now - lastPruneMs < PRUNE_INTERVAL_MS) return;
  lastPruneMs = now;
  await database.delete(oauthHandoffCodes).where(lt(oauthHandoffCodes.expiresAt, new Date(now)));
}
