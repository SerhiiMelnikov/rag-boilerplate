// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts src/lib/auth/prune.integration.test.ts
//
// This is where the row-level semantics actually get proven: the module under
// test relies on a correlated `NOT EXISTS` subquery (see prune.ts), which only
// means anything once a real query engine evaluates it. prune.test.ts fakes the
// db to prove the throttle only; this file proves the deletes themselves.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { pruneAbandonedRegistrations, __resetRegistrationPruneThrottle } from "./prune";

const RUN = process.env.RUN_INTEGRATION === "1";
const PREFIX = "prune-integration-test";

async function cleanup() {
  // Cascades to any surviving token rows (emailVerificationTokens.userId
  // references users.id ON DELETE CASCADE).
  await db.delete(users).where(like(users.email, `${PREFIX}%`));
}

describe.runIf(RUN)("pruneAbandonedRegistrations (integration)", () => {
  beforeEach(async () => {
    __resetRegistrationPruneThrottle();
    await cleanup();
  });

  afterAll(cleanup);

  it("deletes an expired token and the abandoned unverified user it belonged to, but leaves a verified user and a live token alone", async () => {
    const now = Date.now();

    const [abandoned] = await db
      .insert(users)
      .values({ email: `${PREFIX}-abandoned@company.com`, passwordHash: "placeholder", role: "user", emailVerifiedAt: null })
      .returning({ id: users.id });
    const [stillLive] = await db
      .insert(users)
      .values({ email: `${PREFIX}-live@company.com`, passwordHash: "placeholder", role: "user", emailVerifiedAt: null })
      .returning({ id: users.id });
    const [verified] = await db
      .insert(users)
      .values({ email: `${PREFIX}-verified@company.com`, passwordHash: "placeholder", role: "user", emailVerifiedAt: new Date(now) })
      .returning({ id: users.id });

    // The abandoned user's only token already expired — nobody is coming back
    // to claim this address.
    await db.insert(emailVerificationTokens).values({
      token: `${PREFIX}-expired-tok`, userId: abandoned.id, expiresAt: new Date(now - 1000),
    });
    // The live user's token is still good for another day — this row must survive.
    await db.insert(emailVerificationTokens).values({
      token: `${PREFIX}-live-tok`, userId: stillLive.id, expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    // The verified user holds no token at all — exactly the normal steady state
    // consumeVerificationToken leaves behind after a successful verification.
    // (No token row inserted for `verified`.)

    await pruneAbandonedRegistrations({ now: () => now });

    const remainingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `${PREFIX}%`));
    const remainingUserIds = remainingUsers.map((u) => u.id);
    expect(remainingUserIds).not.toContain(abandoned.id); // swept: unverified + no live token
    expect(remainingUserIds).toContain(stillLive.id); // kept: unverified but still has a live token
    expect(remainingUserIds).toContain(verified.id); // kept: verified, regardless of token count

    const remainingTokens = await db
      .select({ token: emailVerificationTokens.token })
      .from(emailVerificationTokens)
      .where(like(emailVerificationTokens.token, `${PREFIX}%`));
    const remainingTokenValues = remainingTokens.map((t) => t.token);
    expect(remainingTokenValues).not.toContain(`${PREFIX}-expired-tok`);
    expect(remainingTokenValues).toContain(`${PREFIX}-live-tok`);
  });
});
