// Executes the shipped drizzle/0020_lowercase_emails.sql — two UPDATE
// statements joined by a statement-breakpoint, not a single combined UPDATE.
// A single statement let Postgres process the winning row before the losing
// row and briefly hold two rows with the same lower-cased email, which the
// unique index on "email" rejects even though the ranking logic is correct;
// splitting into "rename every loser off the canonical address" then "hand
// it to the winner" avoids that (see the .sql file's own header). Nothing
// about a ranked CTE, or the two-statement ordering, is provable against a
// fake db — only a real planner decides which row wins and in what order
// rows are touched — so this executes the real file against a real Postgres.
//
// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts \
//     src/lib/auth/email-normalisation.integration.test.ts
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

// Runs the shipped migration file's statements against this process's real
// (shared, developer) database, inside one transaction — matching how
// drizzle's own migrator commits every statement in a migration file as a
// single unit, rather than as separate autocommitted round-trips.
//
// Fidelity traded for safety: the shipped file has no domain filter, and must
// not gain one — production has to touch every account, forked or not. But
// this suite runs against a real development database, not a throwaway one,
// so each statement gets an extra `AND u."email" LIKE '%<domain>'` appended
// before it runs here. The ranked CTE is untouched and still ranks the
// *entire* real "users" table exactly as production does; only the final
// UPDATE's blast radius is narrowed, so a real account can never be renamed
// or blocked by a test run — even one that already has a genuine
// case-collision sitting in it before this migration ships.
async function runMigration(): Promise<void> {
  const file = await readFile("drizzle/0020_lowercase_emails.sql", "utf8");
  const statements = file.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

  await db.transaction(async (tx) => {
    for (const statement of statements) {
      const scoped = `${statement.replace(/;\s*$/, "")} AND u."email" LIKE '%${DOMAIN}';`;
      await tx.execute(sql.raw(scoped));
    }
  });
}

const seed = (
  email: string,
  over: { emailVerifiedAt?: Date | null; createdAt?: Date; id?: string } = {},
) =>
  db.insert(users).values({
    email, passwordHash: "x", emailVerifiedAt: over.emailVerifiedAt ?? null,
    ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    ...(over.id ? { id: over.id } : {}),
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

  // The unconfirmed row is seeded FIRST (and given the older created_at), and
  // the confirmed row SECOND (and newer) — on purpose. If the migration's
  // "(email_verified_at IS NULL)" ordering key were ever deleted, ranking
  // would fall through to created_at alone and the OLDER (unconfirmed) row
  // would win. Seeding it this way is what makes that regression visible:
  // fix-round-1 deleted that key from the .sql file and reran this test
  // alone — it failed with the winner/loser roles swapped, as expected —
  // before the key was restored.
  it("gives the confirmed row the address and renames + blocks the fork, even though it is newer", async () => {
    const [unconfirmed] = await seed(`Fork.One@${DOMAIN}`, { createdAt: new Date("2020-01-01") });
    const [confirmed] = await seed(`fork.one@${DOMAIN}`, {
      emailVerifiedAt: new Date(),
      createdAt: new Date("2024-01-01"),
    });
    await runMigration();

    const rows = await db.select().from(users).where(inArray(users.id, [confirmed.id, unconfirmed.id]));
    const winner = rows.find((r) => r.id === confirmed.id)!;
    const loser = rows.find((r) => r.id === unconfirmed.id)!;

    expect(winner.email).toBe(`fork.one@${DOMAIN}`);
    expect(winner.blockedAt).toBeNull();
    expect(loser.email).toBe(`fork.one+dup-${unconfirmed.id.slice(0, 8)}@${DOMAIN}`);
    expect(loser.blockedAt).not.toBeNull();
  });

  // Both rows are confirmed, so this isolates the created_at key specifically.
  // Ids are assigned deliberately BACKWARDS from created_at order (the newer
  // row gets the numerically lower id) so that if created_at were ever
  // dropped from the ORDER BY, the id tie-break would pick the wrong (newer)
  // row — this cannot pass by id-ordering coincidence either way.
  it("breaks a tie between two confirmed rows on created_at, oldest first", async () => {
    const [older] = await seed(`Tie.Created@${DOMAIN}`, {
      emailVerifiedAt: new Date(),
      createdAt: new Date("2020-01-01"),
      id: "00000000-0000-4000-8000-000000000002", // higher id than "newer" below
    });
    const [newer] = await seed(`tie.created@${DOMAIN}`, {
      emailVerifiedAt: new Date(),
      createdAt: new Date("2024-01-01"),
      id: "00000000-0000-4000-8000-000000000001", // lower id than "older" above
    });
    await runMigration();

    const rows = await db.select().from(users).where(inArray(users.id, [older.id, newer.id]));
    expect(rows.find((r) => r.id === older.id)!.email).toBe(`tie.created@${DOMAIN}`);
    expect(rows.find((r) => r.id === newer.id)!.email).toContain("+dup-");
  });

  // Both rows share an identical, EXPLICIT created_at (not whatever moment
  // each insert's own transaction happens to stamp), so created_at cannot
  // break the tie — only id can. This is the only coverage the migration's
  // "lowest id" key has; without it, this is a coin flip on random uuids.
  it("breaks a tie between two confirmed rows with identical created_at on id, lowest first", async () => {
    const tiedAt = new Date("2023-06-01T00:00:00Z");
    const [higherId] = await seed(`Tie.Id@${DOMAIN}`, {
      emailVerifiedAt: new Date(),
      createdAt: tiedAt,
      id: "00000000-0000-4000-8000-000000000099",
    });
    const [lowerId] = await seed(`tie.id@${DOMAIN}`, {
      emailVerifiedAt: new Date(),
      createdAt: tiedAt,
      id: "00000000-0000-4000-8000-000000000011",
    });
    await runMigration();

    const rows = await db.select().from(users).where(inArray(users.id, [higherId.id, lowerId.id]));
    expect(rows.find((r) => r.id === lowerId.id)!.email).toBe(`tie.id@${DOMAIN}`);
    expect(rows.find((r) => r.id === higherId.id)!.email).toContain("+dup-");
  });

  // A solo row exercises none of the real idempotency risk: idempotency here
  // specifically means a *loser* is not renamed a second time (no
  // "+dup-...+dup-...") and its blocked_at is not refreshed to a new now() on
  // the second run. The two runMigration() calls below are genuinely separate
  // transactions/commits (see runMigration's own comment), so real wall-clock
  // time advances between them — a regression that re-matches the loser on
  // the second pass produces a demonstrably different blocked_at, not a
  // coincidentally-identical one.
  it("is idempotent — a second run does not re-rename or re-block the loser", async () => {
    await seed(`Idem.Pair@${DOMAIN}`, { emailVerifiedAt: new Date() });
    const [unconfirmed] = await seed(`idem.pair@${DOMAIN}`);
    await runMigration();
    const [firstPass] = await db.select().from(users).where(inArray(users.id, [unconfirmed.id]));
    await runMigration();
    const [secondPass] = await db.select().from(users).where(inArray(users.id, [unconfirmed.id]));
    expect(secondPass.email).toBe(firstPass.email);
    expect(secondPass.blockedAt).toEqual(firstPass.blockedAt);
  });
});
