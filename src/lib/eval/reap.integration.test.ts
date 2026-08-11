// Gated behind RUN_INTEGRATION=1 like the repo's other integration tests. Run:
//   docker compose up -d db && npm run db:migrate
//   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts \
//     src/lib/eval/reap.integration.test.ts
//
// A fake db cannot prove this. The feature IS the SQL -- an UPDATE with a compound
// WHERE over a status set and a Postgres interval -- and a fake would only exercise
// the fake's own chain. The usage dashboard already recorded this lesson.
//
// This runs against the developer's shared local database, which may hold real eval
// runs. Every assertion below is scoped to the ids this test seeds; the test never
// asserts on a total row count, because reapStaleRuns is global by design and may
// legitimately reap someone else's abandoned run in the same call.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, inArray, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evalRuns } from "@/lib/db/schema";
import { evalRepo, STALE_RUN_MESSAGE, STALE_RUN_TIMEOUT_MINUTES } from "./repo";

const RUN = process.env.RUN_INTEGRATION === "1";

// A snapshot shaped enough to satisfy the NOT NULL jsonb column. The reap never
// reads it.
const SNAPSHOT = {
  chatProvider: "google", chatModel: "m", embeddingProvider: "google", embeddingModel: "e",
  vectorStore: "pgvector", topK: 5, temperature: 0, systemPrompt: "p",
} as never;

describe.runIf(RUN)("reapStaleRuns (integration)", () => {
  const created: string[] = [];

  afterAll(async () => {
    if (created.length) await db.delete(evalRuns).where(inArray(evalRuns.id, created));
  });

  async function seed(status: "pending" | "running" | "done", minutesAgo: number): Promise<string> {
    const id = randomUUID();
    await db.insert(evalRuns).values({ id, status, settingsSnapshot: SNAPSHOT });
    created.push(id);
    // Set the heartbeat with the DATABASE's clock, not the test process's: the reap
    // compares against Postgres now(), and a machine-clock skew would make this test
    // pass or fail for a reason that has nothing to do with the code.
    await db.execute(
      sql`update eval_runs set heartbeat_at = now() - make_interval(mins => ${minutesAgo}) where id = ${id}`,
    );
    return id;
  }

  async function statusOf(id: string) {
    const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
    return row as unknown as { status: string; error: string | null };
  }

  it("fails a run that stopped reporting, and leaves a progressing one alone", async () => {
    const stale = await seed("running", STALE_RUN_TIMEOUT_MINUTES + 1);
    const fresh = await seed("running", STALE_RUN_TIMEOUT_MINUTES - 1);

    await evalRepo.reapStaleRuns(db);

    expect(await statusOf(stale)).toMatchObject({ status: "error", error: STALE_RUN_MESSAGE });
    // The fresh run is INSIDE the window by one minute. If the comparison were
    // inverted or the interval dropped, this is the assertion that catches it --
    // the stale one alone would pass against an UPDATE with no WHERE at all.
    expect((await statusOf(fresh)).status).toBe("running");
  });

  it("reaps a pending run that never started", async () => {
    const id = await seed("pending", STALE_RUN_TIMEOUT_MINUTES + 1);
    await evalRepo.reapStaleRuns(db);
    expect((await statusOf(id)).status).toBe("error");
  });

  it("never touches a finished run, however old", async () => {
    const id = await seed("done", STALE_RUN_TIMEOUT_MINUTES * 100);
    await evalRepo.reapStaleRuns(db);
    // Without the status filter this ancient `done` run would be rewritten to
    // `error`, destroying a completed evaluation's verdict.
    expect((await statusOf(id)).status).toBe("done");
  });

  it("moves a run out of reach of the reap when addResult records progress", async () => {
    const id = await seed("running", STALE_RUN_TIMEOUT_MINUTES + 1);
    await evalRepo.addResult({
      runId: id, questionId: null, questionText: "q", retrieved: [],
      hit: false, recall: 0, precision: 0, mrr: 0,
      judgeScore: null, judgeRationale: null, generatedAnswer: null, error: null,
    }, db);
    await evalRepo.reapStaleRuns(db);
    // This is the heartbeat write from Task 3 doing its job: the run was stale a
    // moment ago and is not stale now, purely because a question completed.
    expect((await statusOf(id)).status).toBe("running");
  });

  it("reaps as a side effect of listing runs", async () => {
    const id = await seed("running", STALE_RUN_TIMEOUT_MINUTES + 1);
    await evalRepo.listRuns(db);
    // This is what stops the admin panel polling forever: one list call heals it.
    expect((await statusOf(id)).status).toBe("error");
  });

  // Before the reaper existed, `error` was non-null only when `status = 'error'`
  // (failRun was the only writer of both, together, and a failed run never
  // reached finishRun). The reaper broke that: it writes `error` to a run that
  // is still alive and can still complete. This proves finishRun restores the
  // invariant -- a run that was falsely reaped and then genuinely finishes must
  // not carry the reaper's message into its "done" row.
  it("clears the reaper's error when a falsely-reaped run goes on to finish", async () => {
    const id = await seed("running", STALE_RUN_TIMEOUT_MINUTES + 1);

    await evalRepo.reapStaleRuns(db);
    expect(await statusOf(id)).toMatchObject({ status: "error", error: STALE_RUN_MESSAGE });

    const aggregate = { avgRecall: 1, avgPrecision: 1, avgMrr: 1, avgJudgeScore: 5, passRate: 1, questionCount: 1 };
    await evalRepo.finishRun(id, aggregate, db);

    // Both halves matter: a finishRun that only fixed `status` (the shape this
    // task shipped without the fix) would still leave `error` set here, and a
    // done run silently carrying "Interrupted..." is the exact lie this test
    // exists to catch.
    expect(await statusOf(id)).toMatchObject({ status: "done", error: null });
  });
});
