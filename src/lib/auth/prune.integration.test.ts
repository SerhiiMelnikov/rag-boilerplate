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
import { TOKEN_TTL_MS } from "@/lib/auth/verification";
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

    // Backdated past the token TTL: a real abandoned row's own token (below)
    // already expired, which is only possible if the row itself is at least
    // TOKEN_TTL_MS old — a freshly-created row cannot yet hold an expired
    // token. This is also what exercises the createdAt guard in prune.ts
    // (see the dedicated test below for the guard's own non-vacuity proof).
    const [abandoned] = await db
      .insert(users)
      .values({
        email: `${PREFIX}-abandoned@company.com`,
        passwordHash: "placeholder",
        role: "user",
        emailVerifiedAt: null,
        createdAt: new Date(now - TOKEN_TTL_MS - 60_000),
      })
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

  // The review finding, made non-vacuous: "unverified AND no token" also matches
  // a row that never had a token minted yet at all — the ~1ms window in
  // registerUser between createUnverifiedUser and createVerificationToken (and
  // the identical gap in scripts/seed-admin.ts before its emailVerifiedAt
  // UPDATE). That is NOT abandonment; nobody's link has expired because no link
  // was ever sent. The createdAt guard in prune.ts is what tells the two apart.
  // To confirm this test actually exercises that guard (and is not vacuously
  // true), temporarily remove the `lt(users.createdAt, ...)` condition from
  // pruneAbandonedRegistrations and re-run this file — the first assertion
  // below must fail (the fresh row gets swept).
  it("does not sweep a brand-new unverified row with no token yet, but does sweep an old one in the same state", async () => {
    const now = Date.now();

    // Freshly created, zero token rows — exactly the mid-registration snapshot
    // above. Must survive: it is too young for any link to have possibly expired.
    const [freshNoToken] = await db
      .insert(users)
      .values({ email: `${PREFIX}-fresh-no-token@company.com`, passwordHash: "placeholder", role: "user", emailVerifiedAt: null })
      .returning({ id: users.id });

    // Same shape (unverified, zero token rows) but created before the token TTL
    // window — old enough that any link ever sent to it would have expired by
    // now. This one is genuinely abandoned and must be swept.
    const [oldNoToken] = await db
      .insert(users)
      .values({
        email: `${PREFIX}-old-no-token@company.com`,
        passwordHash: "placeholder",
        role: "user",
        emailVerifiedAt: null,
        createdAt: new Date(now - TOKEN_TTL_MS - 1000),
      })
      .returning({ id: users.id });

    await pruneAbandonedRegistrations({ now: () => now });

    const remaining = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `${PREFIX}%`));
    const remainingIds = remaining.map((u) => u.id);
    expect(remainingIds).toContain(freshNoToken.id); // survives: too young to judge, not abandoned
    expect(remainingIds).not.toContain(oldNoToken.id); // swept: old enough, no live token, genuinely abandoned
  });
});
