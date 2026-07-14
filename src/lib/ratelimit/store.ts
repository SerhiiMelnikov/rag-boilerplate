import { lt, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  // Seconds until the window resets. 0 when allowed.
  retryAfterSeconds: number;
}

export interface ConsumeDeps {
  database?: typeof defaultDb;
  now?: () => number;
}

// Prune at most this often, per process.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
// Keep rows a little longer than the longest window we use (a day), so a bucket
// is never deleted while it is still being counted against.
const RETENTION_MS = 25 * 60 * 60 * 1000;

let lastPruneMs = 0;

// Test-only: the throttle above is module state, which would leak between tests.
export function __resetPruneThrottle(): void {
  lastPruneMs = 0;
}

async function maybePrune(database: typeof defaultDb, now: number): Promise<void> {
  if (now - lastPruneMs < PRUNE_INTERVAL_MS) return;
  lastPruneMs = now;
  await database.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now - RETENTION_MS)));
}

// Count one hit against (key, current window) and say whether it is allowed.
//
// The decision is a single atomic statement: INSERT ... ON CONFLICT DO UPDATE
// SET count = count + 1 RETURNING count. Postgres serialises concurrent writers
// on the row, so two simultaneous requests get 1 and 2 — never both 1. Any
// read-then-write version of this would race and let the limit be exceeded.
export async function consume(
  key: string,
  limit: number,
  windowMs: number,
  deps: ConsumeDeps = {},
): Promise<RateLimitResult> {
  // 0 (or a nonsense negative) disables the rule: never write, never block.
  if (limit <= 0) return { allowed: true, retryAfterSeconds: 0 };

  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;

  const [row] = await database
    .insert(rateLimits)
    .values({ key, windowStart: new Date(windowStartMs), count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  await maybePrune(database, now);

  const count = row?.count ?? 1;
  if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };

  const msUntilReset = windowStartMs + windowMs - now;
  // Never advertise 0 — a client would hot-loop on it.
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msUntilReset / 1000)) };
}
