import { describe, it, expect, vi, beforeEach } from "vitest";
import { consume, __resetPruneThrottle } from "./store";

// Fake db that models the ON CONFLICT DO UPDATE: one counter per (key, window).
function fakeDb() {
  const counters = new Map<string, number>();
  const deleted: unknown[] = [];
  const db = {
    insert: () => ({
      values: ({ key, windowStart }: { key: string; windowStart: Date }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            const k = `${key}@${windowStart.toISOString()}`;
            const next = (counters.get(k) ?? 0) + 1;
            counters.set(k, next);
            return [{ count: next }];
          },
        }),
      }),
    }),
    delete: () => ({ where: async (w: unknown) => { deleted.push(w); } }),
  } as never;
  return { db, counters, deleted };
}

const MINUTE = 60_000;

beforeEach(() => __resetPruneThrottle());

describe("consume", () => {
  it("allows requests up to the limit and denies the one after", async () => {
    const { db } = fakeDb();
    const now = () => 1_000_000;
    for (let i = 0; i < 3; i++) {
      const r = await consume("k", 3, MINUTE, { database: db, now });
      expect(r.allowed).toBe(true);
    }
    const denied = await consume("k", 3, MINUTE, { database: db, now });
    expect(denied.allowed).toBe(false);
  });

  // The whole point of a window: the counter resets when the clock rolls over.
  it("starts a fresh bucket in the next window", async () => {
    const { db } = fakeDb();
    let t = 1_000_000;
    const now = () => t;
    await consume("k", 1, MINUTE, { database: db, now });
    expect((await consume("k", 1, MINUTE, { database: db, now })).allowed).toBe(false);
    t += MINUTE; // roll into the next window
    expect((await consume("k", 1, MINUTE, { database: db, now })).allowed).toBe(true);
  });

  it("reports how long until the window resets", async () => {
    const { db } = fakeDb();
    // 20s into a 60s window: 40s remain.
    const now = () => 20_000;
    await consume("k", 1, MINUTE, { database: db, now });
    const denied = await consume("k", 1, MINUTE, { database: db, now });
    expect(denied.retryAfterSeconds).toBe(40);
  });

  // A denied request must never advertise a Retry-After of 0 — a client would
  // hot-loop on it.
  it("never reports a retry delay below one second", async () => {
    const { db } = fakeDb();
    const now = () => MINUTE - 1; // 1ms left in the window
    await consume("k", 1, MINUTE, { database: db, now });
    const denied = await consume("k", 1, MINUTE, { database: db, now });
    expect(denied.retryAfterSeconds).toBe(1);
  });

  // 0 is the documented "off" switch: it must not even touch the database.
  it("treats a limit of 0 as disabled and writes nothing", async () => {
    const { db, counters } = fakeDb();
    const insert = vi.spyOn(db as unknown as { insert: () => unknown }, "insert");
    const r = await consume("k", 0, MINUTE, { database: db, now: () => 0 });
    expect(r.allowed).toBe(true);
    expect(insert).not.toHaveBeenCalled();
    expect(counters.size).toBe(0);
  });

  it("keys buckets separately, so one user cannot exhaust another's quota", async () => {
    const { db } = fakeDb();
    const now = () => 1_000_000;
    await consume("user:a", 1, MINUTE, { database: db, now });
    expect((await consume("user:a", 1, MINUTE, { database: db, now })).allowed).toBe(false);
    expect((await consume("user:b", 1, MINUTE, { database: db, now })).allowed).toBe(true);
  });

  it("prunes expired rows at most once per hour", async () => {
    const { db, deleted } = fakeDb();
    let t = 10_000_000_000;
    const now = () => t;
    await consume("k", 10, MINUTE, { database: db, now });
    expect(deleted.length).toBe(1); // first call prunes
    await consume("k", 10, MINUTE, { database: db, now });
    expect(deleted.length).toBe(1); // still throttled
    t += 60 * 60 * 1000 + 1; // an hour later
    await consume("k", 10, MINUTE, { database: db, now });
    expect(deleted.length).toBe(2);
  });
});
