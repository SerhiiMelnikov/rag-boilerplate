// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts \
//     src/lib/auth/email-normalisation.integration.test.ts
//
// The migration is a single window-function UPDATE. Nothing about a ranked
// CASE expression is provable against a fake db — only a real planner decides
// which row wins — so this executes the shipped .sql file verbatim.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { like, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const RUN = process.env.RUN_INTEGRATION === "1";
const DOMAIN = "email-norm-test.example";

async function cleanup() {
  await db.delete(users).where(like(users.email, `%${DOMAIN}`));
}

async function runMigration() {
  const file = await readFile("drizzle/0020_lowercase_emails.sql", "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

const seed = (email: string, over: { emailVerifiedAt?: Date | null; createdAt?: Date } = {}) =>
  db.insert(users).values({
    email, passwordHash: "x", emailVerifiedAt: over.emailVerifiedAt ?? null,
    ...(over.createdAt ? { createdAt: over.createdAt } : {}),
  }).returning({ id: users.id });

describe.runIf(RUN)("migration 0020 (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("lowercases an address that collides with nothing", async () => {
    const [row] = await seed(`Solo.User@${DOMAIN}`);
    await runMigration();
    const [after] = await db.select().from(users).where(inArray(users.id, [row.id]));
    expect(after.email).toBe(`solo.user@${DOMAIN}`);
    expect(after.blockedAt).toBeNull();
  });

  it("gives the confirmed row the address and renames + blocks the fork", async () => {
    const [confirmed] = await seed(`Fork.One@${DOMAIN}`, { emailVerifiedAt: new Date() });
    const [unconfirmed] = await seed(`fork.one@${DOMAIN}`);
    await runMigration();

    const rows = await db.select().from(users).where(inArray(users.id, [confirmed.id, unconfirmed.id]));
    const winner = rows.find((r) => r.id === confirmed.id)!;
    const loser = rows.find((r) => r.id === unconfirmed.id)!;

    expect(winner.email).toBe(`fork.one@${DOMAIN}`);
    expect(winner.blockedAt).toBeNull();
    expect(loser.email).toBe(`fork.one+dup-${unconfirmed.id.slice(0, 8)}@${DOMAIN}`);
    expect(loser.blockedAt).not.toBeNull();
  });

  it("breaks a tie between two confirmed rows on created_at, oldest first", async () => {
    const [older] = await seed(`Tie@${DOMAIN}`, { emailVerifiedAt: new Date(), createdAt: new Date("2020-01-01") });
    const [newer] = await seed(`tie@${DOMAIN}`, { emailVerifiedAt: new Date(), createdAt: new Date("2024-01-01") });
    await runMigration();

    const rows = await db.select().from(users).where(inArray(users.id, [older.id, newer.id]));
    expect(rows.find((r) => r.id === older.id)!.email).toBe(`tie@${DOMAIN}`);
    expect(rows.find((r) => r.id === newer.id)!.email).toContain("+dup-");
  });

  it("is idempotent — a second run changes nothing", async () => {
    const [row] = await seed(`Twice@${DOMAIN}`);
    await runMigration();
    const [first] = await db.select().from(users).where(inArray(users.id, [row.id]));
    await runMigration();
    const [second] = await db.select().from(users).where(inArray(users.id, [row.id]));
    expect(second.email).toBe(first.email);
    expect(second.blockedAt).toEqual(first.blockedAt);
  });
});
