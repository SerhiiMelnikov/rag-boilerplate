import { describe, it, expect, beforeEach } from "vitest";
import { emailVerificationTokens, users } from "@/lib/db/schema";
import { pruneAbandonedRegistrations, __resetRegistrationPruneThrottle } from "./prune";

// This suite only proves the throttle: at most one sweep per interval, gated by
// an injectable clock, exactly like ratelimit/store.ts's own maybePrune. The
// row-level semantics (which rows actually get deleted) depend on a correlated
// NOT EXISTS subquery that only means something once a real query engine
// evaluates it — that is proven against real Postgres in
// prune.integration.test.ts instead of faked here.
//
// The fake below never inspects (let alone serializes) the WHERE argument
// passed to delete().where() — it only records WHICH table a delete targeted,
// by reference, and how many times. That is enough to prove the throttle
// without needing to model drizzle's SQL builder internals.
function fakeDb() {
  const deletes: unknown[] = [];
  const db = {
    delete: (table: unknown) => ({
      where: async () => {
        deletes.push(table);
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({}), // only ever handed to notExists() as an opaque subquery; never rendered here
      }),
    }),
  } as never;
  return { db, deletes };
}

beforeEach(() => {
  __resetRegistrationPruneThrottle();
});

describe("pruneAbandonedRegistrations", () => {
  it("deletes expired tokens, then abandoned users, in that order", async () => {
    const { db, deletes } = fakeDb();
    await pruneAbandonedRegistrations({ database: db, now: () => 10_000_000_000 });
    expect(deletes).toEqual([emailVerificationTokens, users]);
  });

  // The load-bearing property, made non-vacuous: remove the
  // `now - lastPruneMs < PRUNE_INTERVAL_MS` guard (or the throttle entirely)
  // and this test fails, because every call below would sweep.
  it("runs at most once per interval, no matter how many times it's called", async () => {
    const { db, deletes } = fakeDb();
    const now = () => 10_000_000_000;
    await pruneAbandonedRegistrations({ database: db, now });
    await pruneAbandonedRegistrations({ database: db, now });
    await pruneAbandonedRegistrations({ database: db, now });
    expect(deletes.length).toBe(2); // one sweep only: tokens + users
  });

  it("sweeps again once the interval has elapsed", async () => {
    const { db, deletes } = fakeDb();
    let t = 10_000_000_000;
    await pruneAbandonedRegistrations({ database: db, now: () => t });
    expect(deletes.length).toBe(2);

    t += 60 * 60 * 1000 + 1; // an hour (+1ms) later
    await pruneAbandonedRegistrations({ database: db, now: () => t });
    expect(deletes.length).toBe(4);
  });
});
