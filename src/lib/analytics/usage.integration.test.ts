// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts src/lib/analytics/usage.integration.test.ts
//
// Why this exists when the unit suite mocks db.execute: that only tests the
// TypeScript mapping, never the SQL. Aggregate the wrong column, join the wrong
// table, or drop the null-workspace rows and the unit suite stays green. This
// seeds real rows into the developer's own DATABASE_URL and asserts real
// aggregates, then deletes exactly the rows it created.
//
// This runs against a real, shared development database that may already hold
// unrelated usage data (or gain more from someone using the app concurrently).
// Per-user and per-workspace(X/Y) assertions use freshly generated random ids,
// which cannot collide with anything pre-existing, so those are asserted
// exactly. The summary, the shared "Unassigned" workspace bucket, and today's
// trend point are shared totals the whole table contributes to, so those are
// asserted as a baseline-plus-fixture delta instead of a hardcoded absolute.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, workspaces, conversations, messages } from "@/lib/db/schema";
import { getUsageSummary, getUsageByUser, getUsageByWorkspace, getUsageTrend, USAGE_WINDOW_DAYS } from "./usage";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.runIf(RUN)("usage analytics (integration)", () => {
  // Two users, so the per-user breakdown has something to order.
  const userAId = randomUUID();
  const userBId = randomUUID();
  // Two workspaces; one message below has a null workspace_id to exercise the
  // "Unassigned" bucket.
  const workspaceXId = randomUUID();
  const workspaceYId = randomUUID();
  const convAId = randomUUID();
  // User A gets a SECOND conversation, on purpose: with only one conversation
  // per user, "group by conversation" and "group by user" produce identical
  // rows, so a regression that widens getUsageByUser's GROUP BY to include the
  // conversation id would still pass. With two conversations for the same
  // user, that regression emits two rows where this fixture expects one, and
  // the per-user assertion below catches it.
  const convA2Id = randomUUID();
  const convBId = randomUUID();
  let todayLabel = "";
  let baselineSummary = { promptTokens: 0, completionTokens: 0, totalTokens: 0, answers: 0 };
  let baselineUnassigned = { promptTokens: 0, completionTokens: 0, answers: 0 };
  let baselineTodayTrend = { promptTokens: 0, completionTokens: 0 };

  beforeAll(async () => {
    // Snapshot shared aggregates BEFORE seeding, so assertions below can check
    // "baseline + this fixture's contribution" instead of a hardcoded absolute
    // that would break if the shared dev DB already holds (or concurrently
    // gains) other in-window usage.
    baselineSummary = await getUsageSummary();
    const baselineByWorkspace = await getUsageByWorkspace();
    const preUnassigned = baselineByWorkspace.find((r) => r.id === null);
    if (preUnassigned) baselineUnassigned = preUnassigned;
    const baselineTrend = await getUsageTrend();

    await db.insert(users).values([
      { id: userAId, email: `usage-test-a-${userAId}@example.com`, passwordHash: "x" },
      { id: userBId, email: `usage-test-b-${userBId}@example.com`, passwordHash: "x" },
    ]);
    await db.insert(workspaces).values([
      { id: workspaceXId, name: `Usage Test Workspace X ${workspaceXId}` },
      { id: workspaceYId, name: `Usage Test Workspace Y ${workspaceYId}` },
    ]);
    await db.insert(conversations).values([
      { id: convAId, userId: userAId },
      { id: convA2Id, userId: userAId },
      { id: convBId, userId: userBId },
    ]);

    const [{ day }] = (await db.execute(sql`select to_char(now(), 'YYYY-MM-DD') as day`)) as unknown as { day: string }[];
    todayLabel = day;
    const preToday = baselineTrend.find((p) => p.day === todayLabel);
    if (preToday) baselineTodayTrend = preToday;

    await db.insert(messages).values([
      // In window, workspace X. Distinct prompt/completion so a transposed column fails.
      { conversationId: convAId, role: "assistant", content: "a1", workspaceId: workspaceXId, usage: { promptTokens: 100, completionTokens: 50 } },
      // In window, null workspace -> "Unassigned" bucket.
      { conversationId: convAId, role: "assistant", content: "a2", workspaceId: null, usage: { promptTokens: 40, completionTokens: 10 } },
      // User message (no usage) -> must be excluded from every aggregate.
      { conversationId: convAId, role: "user", content: "q1", workspaceId: workspaceXId, usage: null },
      // Assistant row with usage null -> must be excluded from every aggregate.
      { conversationId: convAId, role: "assistant", content: "a3", workspaceId: workspaceXId, usage: null },
      // Assistant row dated outside the window -> must be excluded from all four queries.
      // Large, distinct usage numbers so an accidental inclusion is obvious.
      { conversationId: convAId, role: "assistant", content: "a4-stale", workspaceId: workspaceXId, usage: { promptTokens: 999, completionTokens: 999 }, createdAt: sql`now() - interval '31 days'` },
      // In window, workspace Y, second user.
      { conversationId: convBId, role: "assistant", content: "b1", workspaceId: workspaceYId, usage: { promptTokens: 20, completionTokens: 5 } },
      // In window, user A's SECOND conversation, workspace X. Must merge into
      // user A's single row (not add a second one) and must add into workspace
      // X's total alongside a1.
      { conversationId: convA2Id, role: "assistant", content: "a5", workspaceId: workspaceXId, usage: { promptTokens: 15, completionTokens: 7 } },
    ]);
  });

  afterAll(async () => {
    // Users cascade to conversations, which cascade to messages — deleting the
    // two seeded users removes everything above. Workspaces have no cascading
    // FK from messages (ON DELETE SET NULL), so delete them explicitly. Both
    // deletes target only the ids this file created, never a predicate that
    // could match pre-existing rows.
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceXId, workspaceYId]));
  });

  it("USAGE_WINDOW_DAYS is 30", () => {
    expect(USAGE_WINDOW_DAYS).toBe(30);
  });

  it("getUsageSummary aggregates only the in-window assistant rows with usage", async () => {
    const summary = await getUsageSummary();
    // Fixture total across all 4 in-window rows: a1(100/50) + a2(40/10) +
    // a5(15/7) + b1(20/5) = 175 prompt / 72 completion / 247 total / 4 answers.
    expect(summary).toEqual({
      promptTokens: baselineSummary.promptTokens + 175,
      completionTokens: baselineSummary.completionTokens + 72,
      totalTokens: baselineSummary.totalTokens + 247,
      answers: baselineSummary.answers + 4,
    });
  });

  it("getUsageByUser merges both of user A's conversations into a single row, ordered heaviest first", async () => {
    const rows = (await getUsageByUser()).filter((r) => r.id === userAId || r.id === userBId);
    // User A's row must merge convA (a1: 100/50, a2: 40/10) and convA2 (a5: 15/7)
    // into exactly ONE row (155/67/222/3 answers), not two. A regression that
    // groups by conversation as well as user would emit a second userAId row
    // here instead, and this exact toEqual would fail on array shape alone.
    expect(rows).toEqual([
      { id: userAId, label: expect.stringContaining("usage-test-a-"), promptTokens: 155, completionTokens: 67, totalTokens: 222, answers: 3 },
      { id: userBId, label: expect.stringContaining("usage-test-b-"), promptTokens: 20, completionTokens: 5, totalTokens: 25, answers: 1 },
    ]);
  });

  it("getUsageByWorkspace includes the Unassigned bucket with id: null, ordered heaviest first", async () => {
    const all = await getUsageByWorkspace();

    const unassigned = all.find((r) => r.id === null);
    expect(unassigned).toEqual({
      id: null,
      label: "Unassigned",
      promptTokens: baselineUnassigned.promptTokens + 40,
      completionTokens: baselineUnassigned.completionTokens + 10,
      totalTokens: baselineUnassigned.promptTokens + baselineUnassigned.completionTokens + 50,
      answers: baselineUnassigned.answers + 1,
    });

    // Workspace X aggregates a1 (100/50, convA) AND a5 (15/7, convA2) — two
    // messages from two different conversations of the same user, both tagged
    // with this workspace.
    const x = all.find((r) => r.id === workspaceXId);
    expect(x).toEqual({ id: workspaceXId, label: expect.stringContaining("Usage Test Workspace X"), promptTokens: 115, completionTokens: 57, totalTokens: 172, answers: 2 });

    const y = all.find((r) => r.id === workspaceYId);
    expect(y).toEqual({ id: workspaceYId, label: expect.stringContaining("Usage Test Workspace Y"), promptTokens: 20, completionTokens: 5, totalTokens: 25, answers: 1 });

    // Ordering: heaviest total first. x (172) and y (25) are exact, baseline-free
    // totals (their ids are fresh random UUIDs nothing else can contribute to),
    // so x must sort ahead of y regardless of whatever the shared Unassigned
    // bucket's baseline happens to be.
    const ix = all.indexOf(x!);
    const iy = all.indexOf(y!);
    expect(ix).toBeLessThan(iy);
  });

  it("getUsageTrend contains the seeded day and excludes the out-of-window day", async () => {
    const trend = await getUsageTrend();
    const todayPoint = trend.find((p) => p.day === todayLabel);
    // Same 175/72/247 fixture total as getUsageSummary — all 4 in-window rows
    // (a1, a2, a5, b1) share "today" as their created_at day.
    expect(todayPoint).toEqual({
      day: todayLabel,
      promptTokens: baselineTodayTrend.promptTokens + 175,
      completionTokens: baselineTodayTrend.completionTokens + 72,
      totalTokens: baselineTodayTrend.promptTokens + baselineTodayTrend.completionTokens + 247,
    });

    // The stale row is 31 days before "today" — a different calendar day — and
    // must not show up anywhere with its distinctive 999/999 usage.
    const leaked = trend.find((p) => p.promptTokens === 999 || p.completionTokens === 999);
    expect(leaked).toBeUndefined();
  });
});
