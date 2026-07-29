// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   DATABASE_URL=... RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts src/lib/auth/oauth/handoff-codes.integration.test.ts
//
// Why this exists rather than a richer fake: single use is a property of a
// transaction against a real database. A fake can prove only that the fake was
// asked the right question — drop the delete in production and a fake-based
// test stays green while one code mints unlimited sessions.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createHandoffCode, consumeHandoffCode, HANDOFF_CODE_TTL_MS } from "./handoff-codes";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.runIf(RUN)("oauth handoff codes (integration)", () => {
  const createdUserIds: string[] = [];

  async function makeUser(): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({
      id, email: `handoff-${id}@example.test`, passwordHash: "x", role: "user", emailVerifiedAt: new Date(),
    });
    createdUserIds.push(id);
    return id;
  }

  beforeEach(() => { createdUserIds.length = 0; });
  afterAll(async () => {
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it("returns the user id once and only once", async () => {
    const id = await makeUser();
    const code = await createHandoffCode(id);
    expect(await consumeHandoffCode(code)).toBe(id);
    expect(await consumeHandoffCode(code)).toBeNull();
  });

  it("refuses an expired code and does not leave it behind", async () => {
    const id = await makeUser();
    const code = await createHandoffCode(id, { now: () => Date.now() - HANDOFF_CODE_TTL_MS - 1000 });
    expect(await consumeHandoffCode(code)).toBeNull();
    // Second call proves the row was removed rather than merely rejected.
    expect(await consumeHandoffCode(code)).toBeNull();
  });

  it("refuses a code that was never minted", async () => {
    expect(await consumeHandoffCode("never-existed")).toBeNull();
  });

  // The sequential test above never contends for the row, so a SELECT-then-
  // DELETE implementation (no row lock taken by a plain SELECT under READ
  // COMMITTED) would pass it while still letting two concurrent redemptions
  // both see the row and both return the same user id. Firing both calls via
  // Promise.all forces genuine contention: exactly one must win.
  it("lets exactly one of two concurrent redemptions win", async () => {
    const id = await makeUser();
    const code = await createHandoffCode(id);
    const [a, b] = await Promise.all([consumeHandoffCode(code), consumeHandoffCode(code)]);
    expect([a, b].filter((r) => r === id)).toHaveLength(1);
    expect([a, b].filter((r) => r === null)).toHaveLength(1);
  });
});
