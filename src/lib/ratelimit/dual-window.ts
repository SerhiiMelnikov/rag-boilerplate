import type { consume } from "./store";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DualWindowLimits {
  perMinute: number;
  perDay: number;
}

// Rate-limits one user's action against two independent buckets — a burst
// guard (per minute) and a daily quota — under one key prefix such as "chat"
// or "transcribe". Shared by src/api/chat/handler.ts and
// src/api/chat/transcribe/handler.ts, which differ only in the key prefix,
// the settings fields feeding the two limits, and the noun in the 429
// message ("message" / "voice").
//
// The minute rule is checked FIRST and short-circuits: a request it already
// rejected never touches the day bucket, so a burst that trips the per-minute
// guard does not also burn a slot of the daily quota.
//
// Callers MUST run this before parsing the request body or doing any other
// work — a limit enforced after the expensive part isn't a limit. Returns the
// 429 Response to return immediately, or null when both windows allow the
// request.
export async function checkDualWindowRateLimit(
  userId: string,
  prefix: string,
  label: string,
  limits: DualWindowLimits,
  rateLimitFn: typeof consume,
): Promise<Response | null> {
  for (const [rule, limit, windowMs] of [
    ["minute", limits.perMinute, MINUTE_MS],
    ["day", limits.perDay, DAY_MS],
  ] as const) {
    const verdict = await rateLimitFn(`${prefix}:${rule}:user:${userId}`, limit, windowMs);
    if (!verdict.allowed) {
      return Response.json(
        { error: `You have reached the ${label} limit. Try again in ${verdict.retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
  }
  return null;
}
