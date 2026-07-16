import { describe, it, expect, vi, beforeEach } from "vitest";
import { consume, __resetPruneThrottle } from "./store";
import { lt } from "drizzle-orm";

// The real cutoff Date store.ts computes for the prune's `WHERE window_start <
// cutoff` is otherwise opaque here (this suite fakes the whole `db`, so the
// condition object built by `lt()` is never actually evaluated by a real
// query engine). Wrapping `lt` with a spy (but still calling through to the
// real implementation) lets fakeDb's `delete().where()` below read the exact
// cutoff production code used, so a test can assert on it instead of only on
// "a delete happened".
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, lt: vi.fn(actual.lt) };
});

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
    delete: () => ({
      where: async (w: unknown) => {
        deleted.push(w);
        // Simulate the real `DELETE ... WHERE window_start < cutoff`: drop
        // every bucket whose windowStart is older than the cutoff store.ts
        // actually passed to `lt()` for this call (captured by the spy
        // above), rather than just recording that some delete happened.
        const cutoff = vi.mocked(lt).mock.calls.at(-1)?.[1] as Date | undefined;
        if (!cutoff) return;
        for (const k of [...counters.keys()]) {
          const windowStartIso = k.slice(k.indexOf("@") + 1);
          if (new Date(windowStartIso).getTime() < cutoff.getTime()) counters.delete(k);
        }
      },
    }),
  } as never;
  return { db, counters, deleted };
}

const MINUTE = 60_000;

beforeEach(() => {
  __resetPruneThrottle();
  vi.mocked(lt).mockClear();
});

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

  // The previous test only asserted that a delete happened, never what it deleted.
  // RETENTION_MS (documented as "a little longer than the longest window we use, a
  // day") is what keeps a live day-quota bucket alive across a prune; a change that
  // shrinks it below a day would keep that test green while silently resetting
  // live day-quotas on every hourly prune. This asserts the actual behavior that
  // matters: a bucket still inside its day-long window must survive a prune that
  // runs later that same day.
  it("does not delete a bucket that is still inside its day-long window", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const { db, counters } = fakeDb();

    // Establish a day-window bucket at t=0 and immediately exhaust its limit of 1,
    // so a later hit on the same window is only allowed if the bucket survived.
    await consume("k", 1, DAY, { database: db, now: () => 0 });
    expect((await consume("k", 1, DAY, { database: db, now: () => 0 })).allowed).toBe(false);

    // Roll the clock forward exactly one day-window (a fresh bucket for a
    // different key) and force the prune to run again by clearing its
    // once-per-hour throttle.
    __resetPruneThrottle();
    await consume("other", 1, DAY, { database: db, now: () => DAY });

    // The original bucket — still within its own day-long window — must not
    // have been pruned away.
    expect(counters.has(`k@${new Date(0).toISOString()}`)).toBe(true);
    expect((await consume("k", 1, DAY, { database: db, now: () => 0 })).allowed).toBe(false);
  });
});
