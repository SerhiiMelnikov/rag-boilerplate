// Gated behind RUN_INTEGRATION=1, same pattern as delete.integration.test.ts. Run:
//   docker compose up -d db && npm run db:migrate && npm run seed:admin
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts \
//     src/lib/workspaces/list.integration.test.ts
//
// admin.test.ts's fakeDb models a select().from().where().limit() chain with no
// .orderBy() — listWorkspaces uses neither .where() nor that shape at all (it's
// select().from().leftJoin().groupBy().orderBy()), so a fake here would only prove
// the fake's own plumbing, not the aggregate. Only a real engine can prove the
// CASE/COUNT is correct.
//
// This runs against the developer's shared local database (see delete.integration.
// test.ts's own note on that), which already has real users and workspaces sitting
// in it. That is exactly why the default workspace's expected count is computed as
// "however many users existed before this test ran, plus the three it seeds" rather
// than a bare literal 3 — a literal would only pass by accident on an empty database.
// The non-default workspace's count needs no such baseline: it is a brand-new
// workspace with a fresh random id, so no pre-existing grant can reference it.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, workspaces, userWorkspaces } from "@/lib/db/schema";
import { listWorkspaces } from "./admin";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.runIf(RUN)("listWorkspaces (integration)", () => {
  const createdUserIds: string[] = [];
  const createdWorkspaceIds: string[] = [];

  afterAll(async () => {
    // Users cascade to their user_workspaces grants. The workspace has no FK from
    // a user, so it needs its own delete.
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    if (createdWorkspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  });

  it("counts all users for the default workspace and only grants for the others", async () => {
    const baseCountRows = (await db.execute(sql`select count(*)::int as count from users`)) as unknown as { count: number }[];
    const baseUserCount = baseCountRows[0]!.count;

    // Seed three users. Grant exactly one of them the non-default workspace.
    // Grant NOBODY the default workspace, so its grant count (0) differs from
    // the answer (baseUserCount + 3) — that gap is what makes the assertion
    // meaningful: a bug that swapped in the plain grant count for the default
    // workspace would report 0, not baseUserCount + 3.
    const userIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of userIds) {
      await db.insert(users).values({ id, email: `ws-list-test-${id}@example.test`, passwordHash: "x" });
      createdUserIds.push(id);
    }

    const otherId = randomUUID();
    await db.insert(workspaces).values({ id: otherId, name: `ws-list-test-other-${otherId}` });
    createdWorkspaceIds.push(otherId);

    await db.insert(userWorkspaces).values({ userId: userIds[0]!, workspaceId: otherId });

    const rows = await listWorkspaces(db);
    const general = rows.find((r) => r.isDefault);
    expect(general, "run `npm run seed:admin` first").toBeDefined();
    const other = rows.find((r) => r.id === otherId)!;

    expect(general!.userCount).toBe(baseUserCount + 3);
    expect(other.userCount).toBe(1);
  });
});
