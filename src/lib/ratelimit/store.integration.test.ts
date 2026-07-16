// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts src/lib/ratelimit/store.integration.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";
import { consume, __resetPruneThrottle } from "./store";

const RUN = process.env.RUN_INTEGRATION === "1";
const KEY = "integration-test-key";

describe.runIf(RUN)("consume (integration)", () => {
  beforeEach(async () => {
    __resetPruneThrottle();
    await db.delete(rateLimits).where(eq(rateLimits.key, KEY));
  });

  // The whole design rests on this: 20 concurrent requests against a limit of 5
  // must yield exactly 5 allowed. A read-then-write implementation fails here.
  it("does not let concurrent requests exceed the limit", async () => {
    const now = () => 1_700_000_000_000;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(KEY, 5, 60_000, { now })),
    );
    expect(results.filter((r) => r.allowed).length).toBe(5);
    expect(results.filter((r) => !r.allowed).length).toBe(15);
  });
});
