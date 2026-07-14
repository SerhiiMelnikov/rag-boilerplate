import { describe, it, expect, vi } from "vitest";
import { registerUser } from "./handler";
import { DuplicateEmailError } from "@/lib/auth/users";

const LIMITS = { chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200, registerRateLimitPerHour: 5 };

function baseDeps() {
  return {
    createUserFn: vi.fn(async () => ({ id: "u1", email: "a@b.co", role: "user" as const })),
    getLimitsFn: vi.fn(async () => LIMITS),
    // Explicit param types (not just `async () => ...`) so `.mock.calls` below is typed
    // as [string, number, number][] instead of an empty tuple — matches the pattern in
    // chat/route.test.ts.
    rateLimitFn: vi.fn(async (_key: string, _limit: number, _windowMs: number) => ({ allowed: true, retryAfterSeconds: 0 })),
  };
}

function req(body: unknown, ip = "203.0.113.7") {
  return new Request("http://test/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

// Variant that omits x-forwarded-for entirely (unlike req(), which always sets it,
// even to an empty string) — mirrors a direct hit with no proxy in front, e.g. local dev.
function reqNoForwardedFor(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("http://test/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

// NOTE: the installed zod (^3.25.76) rejects "a@b.c" as an invalid email (its TLD
// must be at least 2 characters), so a valid-looking single-letter TLD is used here
// instead of the shorter form seen in some drafts of this fixture.
const GOOD = { email: "a@b.co", password: "password123" };

describe("registerUser", () => {
  it("creates the user when under the limit", async () => {
    const deps = baseDeps();
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    expect(deps.createUserFn).toHaveBeenCalled();
  });

  it("returns 429 with Retry-After and does NOT create the user when throttled", async () => {
    const deps = baseDeps();
    deps.rateLimitFn = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 900 }));
    const res = await registerUser(req(GOOD), deps);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    // The whole point: a throttled bot must not get an account.
    expect(deps.createUserFn).not.toHaveBeenCalled();
  });

  it("buckets by client IP, taking the first hop of x-forwarded-for", async () => {
    const deps = baseDeps();
    await registerUser(req(GOOD, "198.51.100.9, 10.0.0.1"), deps);
    const key = deps.rateLimitFn.mock.calls[0][0] as string;
    expect(key).toContain("198.51.100.9");
    expect(key).not.toContain("10.0.0.1");
  });

  it("uses an hour window and the configured limit", async () => {
    const deps = baseDeps();
    await registerUser(req(GOOD), deps);
    const [, limit, windowMs] = deps.rateLimitFn.mock.calls[0];
    expect(limit).toBe(5);
    expect(windowMs).toBe(3_600_000);
  });

  it("still rejects invalid input with 400", async () => {
    const res = await registerUser(req({ email: "nope", password: "x" }), baseDeps());
    expect(res.status).toBe(400);
  });

  it("still reports a duplicate email as 409", async () => {
    const deps = baseDeps();
    deps.createUserFn = vi.fn(async () => { throw new DuplicateEmailError("taken"); });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(409);
  });

  // Design fix (overrides the original brief): without x-forwarded-for there is no
  // client identity to bucket on, so we skip the rate-limit check entirely rather than
  // fall back to a shared "unknown" bucket — see clientIp's comment in handler.ts for
  // why a shared bucket would be a self-inflicted DoS and would break local dev.
  it("skips rate limiting entirely when x-forwarded-for is absent, and still creates the user", async () => {
    const deps = baseDeps();
    const res = await registerUser(reqNoForwardedFor(GOOD), deps);

    expect(res.status).toBe(201);
    expect(deps.rateLimitFn).not.toHaveBeenCalled();
    expect(deps.createUserFn).toHaveBeenCalled();
  });

  it("treats an empty/whitespace-only x-forwarded-for the same as absent", async () => {
    const deps = baseDeps();
    const res = await registerUser(reqNoForwardedFor(GOOD, { "x-forwarded-for": "   " }), deps);

    expect(res.status).toBe(201);
    expect(deps.rateLimitFn).not.toHaveBeenCalled();
    expect(deps.createUserFn).toHaveBeenCalled();
  });
});
