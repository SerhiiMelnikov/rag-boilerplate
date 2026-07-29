// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts src/lib/auth/password-reset.integration.test.ts
//
// Why this exists rather than a richer fake: consumePasswordResetToken's
// decisive behaviour is a multi-statement transaction whose UPDATE is scoped
// `WHERE id = ? AND email_verified_at IS NOT NULL AND blocked_at IS NULL`.
// A fake db can only prove that the fake was asked the right question. Drop
// either half of that scope in production and a fake-based test can stay green
// while a real database happily resets an unverified or blocked account's
// password. These run against real rows and assert the real outcome.
//
// Every row created here is deleted in afterAll; ids are random UUIDs so they
// cannot collide with anything already in a shared development database.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, passwordResetTokens } from "@/lib/db/schema";
import {
  createPasswordResetToken,
  consumePasswordResetToken,
  setPasswordAndInvalidateSessions,
} from "./password-reset";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.runIf(RUN)("password reset (integration)", () => {
  const createdUserIds: string[] = [];

  async function makeUser(opts: { verified: boolean; blocked?: boolean }): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: `reset-${id}@example.test`,
      passwordHash: "original-hash",
      role: "user",
      emailVerifiedAt: opts.verified ? new Date() : null,
      blockedAt: opts.blocked ? new Date() : null,
    });
    createdUserIds.push(id);
    return id;
  }

  const hashOf = async (id: string) => {
    const [row] = await db.select({ passwordHash: users.passwordHash, sessionsValidFrom: users.sessionsValidFrom })
      .from(users).where(eq(users.id, id)).limit(1);
    return row;
  };

  beforeEach(() => { createdUserIds.length = 0; });

  afterAll(async () => {
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it("sets the new hash and a session cut-off for a verified user", async () => {
    const id = await makeUser({ verified: true });
    const token = await createPasswordResetToken(id);
    expect(await consumePasswordResetToken(token, "new-hash")).toBe(true);
    const row = await hashOf(id);
    expect(row.passwordHash).toBe("new-hash");
    expect(row.sessionsValidFrom).toBeInstanceOf(Date);
  });

  it("refuses an unverified user and leaves the hash untouched", async () => {
    const id = await makeUser({ verified: false });
    const token = await createPasswordResetToken(id);
    expect(await consumePasswordResetToken(token, "new-hash")).toBe(false);
    expect((await hashOf(id)).passwordHash).toBe("original-hash");
  });

  it("refuses a user blocked after the token was minted", async () => {
    const id = await makeUser({ verified: true });
    const token = await createPasswordResetToken(id);
    await db.update(users).set({ blockedAt: new Date() }).where(eq(users.id, id));
    expect(await consumePasswordResetToken(token, "new-hash")).toBe(false);
    expect((await hashOf(id)).passwordHash).toBe("original-hash");
  });

  // The instant one link succeeds, every other live link for that account must
  // go inert — including one minted by someone else who typed this address.
  it("destroys every sibling token on success", async () => {
    const id = await makeUser({ verified: true });
    const a = await createPasswordResetToken(id);
    const b = await createPasswordResetToken(id);
    expect(await consumePasswordResetToken(a, "new-hash")).toBe(true);
    const left = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    expect(left).toEqual([]);
    expect(await consumePasswordResetToken(b, "attacker-hash")).toBe(false);
    expect((await hashOf(id)).passwordHash).toBe("new-hash");
  });

  it("cannot consume the same token twice", async () => {
    const id = await makeUser({ verified: true });
    const token = await createPasswordResetToken(id);
    expect(await consumePasswordResetToken(token, "first")).toBe(true);
    expect(await consumePasswordResetToken(token, "second")).toBe(false);
    expect((await hashOf(id)).passwordHash).toBe("first");
  });

  it("setPasswordAndInvalidateSessions writes the hash and clears pending reset links", async () => {
    const id = await makeUser({ verified: true });
    const pending = await createPasswordResetToken(id);
    await setPasswordAndInvalidateSessions(id, "changed-hash");
    const row = await hashOf(id);
    expect(row.passwordHash).toBe("changed-hash");
    expect(row.sessionsValidFrom).toBeInstanceOf(Date);
    expect(await consumePasswordResetToken(pending, "attacker-hash")).toBe(false);
    expect((await hashOf(id)).passwordHash).toBe("changed-hash");
  });
});
