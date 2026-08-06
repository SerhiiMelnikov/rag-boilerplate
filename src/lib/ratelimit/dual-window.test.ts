import { describe, it, expect, vi } from "vitest";
import { checkDualWindowRateLimit } from "./dual-window";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("checkDualWindowRateLimit", () => {
  it("returns null (allowed) when both windows allow the request", async () => {
    const rateLimitFn = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
    const res = await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 10, perDay: 100 }, rateLimitFn as never);
    expect(res).toBeNull();
    expect(rateLimitFn).toHaveBeenCalledTimes(2);
  });

  it("checks the minute bucket before the day bucket, with the exact key shape and windows", async () => {
    const calls: Array<[string, number, number]> = [];
    const rateLimitFn = vi.fn(async (key: string, limit: number, windowMs: number) => {
      calls.push([key, limit, windowMs]);
      return { allowed: true, retryAfterSeconds: 0 };
    });
    await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect(calls).toEqual([
      ["chat:minute:user:u1", 10, MINUTE_MS],
      ["chat:day:user:u1", 100, DAY_MS],
    ]);
  });

  it("uses the given prefix in both bucket keys", async () => {
    const calls: string[] = [];
    const rateLimitFn = vi.fn(async (key: string) => {
      calls.push(key);
      return { allowed: true, retryAfterSeconds: 0 };
    });
    await checkDualWindowRateLimit("u1", "transcribe", "voice", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect(calls).toEqual(["transcribe:minute:user:u1", "transcribe:day:user:u1"]);
  });

  it("short-circuits on the minute rule: the day rule is never consulted", async () => {
    const rateLimitFn = vi.fn(async (key: string) =>
      key.startsWith("chat:minute") ? { allowed: false, retryAfterSeconds: 7 } : { allowed: true, retryAfterSeconds: 0 });
    const res = await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect(rateLimitFn).toHaveBeenCalledTimes(1);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  it("rejects on the day rule after the minute rule allowed", async () => {
    const rateLimitFn = vi.fn(async (key: string) =>
      key.startsWith("chat:day") ? { allowed: false, retryAfterSeconds: 30 } : { allowed: true, retryAfterSeconds: 0 });
    const res = await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect(rateLimitFn).toHaveBeenCalledTimes(2);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBe("30");
  });

  it("builds the 429 body from the given label and the verdict's retryAfterSeconds", async () => {
    const rateLimitFn = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 42 }));
    const res = await checkDualWindowRateLimit("u1", "transcribe", "voice", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBe("42");
    expect(await res!.json()).toEqual({ error: "You have reached the voice limit. Try again in 42 seconds." });
  });

  it("keeps the message- and voice-limit copy distinct for the same shape of failure", async () => {
    const rateLimitFn = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 5 }));
    const chatRes = await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 10, perDay: 100 }, rateLimitFn as never);
    const transcribeRes = await checkDualWindowRateLimit("u1", "transcribe", "voice", { perMinute: 10, perDay: 100 }, rateLimitFn as never);

    expect((await chatRes!.json()).error).toBe("You have reached the message limit. Try again in 5 seconds.");
    expect((await transcribeRes!.json()).error).toBe("You have reached the voice limit. Try again in 5 seconds.");
  });

  it("forwards a 0 limit to rateLimitFn unchanged, honoring consume's 'disabled' contract", async () => {
    // Mirrors consume()'s real "limit <= 0 means never write, never block" rule
    // (src/lib/ratelimit/store.ts), so this proves the helper passes the limit
    // through rather than special-casing 0 itself.
    const limits: number[] = [];
    const rateLimitFn = vi.fn(async (_key: string, limit: number) => {
      limits.push(limit);
      return { allowed: limit <= 0, retryAfterSeconds: limit <= 0 ? 0 : 1 };
    });
    const res = await checkDualWindowRateLimit("u1", "chat", "message", { perMinute: 0, perDay: 0 }, rateLimitFn as never);

    expect(res).toBeNull();
    expect(limits).toEqual([0, 0]);
  });
});
