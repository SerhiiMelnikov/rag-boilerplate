import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { evalRepo, STALE_RUN_MESSAGE } from "./repo";
import { evalRuns } from "@/lib/db/schema";

describe("evalRepo.listQuestions", () => {
  it("returns questions ordered by createdAt desc", async () => {
    const rows = [{ id: "q1", question: "Q?", expectedDocumentIds: ["d1"], referenceAnswer: null, createdAt: new Date(0) }];
    const db = { select: () => ({ from: () => ({ orderBy: async () => rows }) }) } as never;
    expect(await evalRepo.listQuestions(db)).toEqual(rows);
  });
});

describe("evalRepo.getQuestion", () => {
  it("returns the question when found", async () => {
    const row = { id: "q1", question: "Q?", expectedDocumentIds: [], referenceAnswer: null, createdAt: new Date(0) };
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) } as never;
    expect(await evalRepo.getQuestion("q1", db)).toEqual(row);
  });

  it("returns null when not found", async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as never;
    expect(await evalRepo.getQuestion("q1", db)).toBeNull();
  });
});

describe("evalRepo.createQuestion", () => {
  it("stores expectedDocumentIds as given and returns the new id", async () => {
    let inserted: unknown;
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserted = v;
          return { returning: async () => [{ id: "q1" }] };
        },
      }),
    } as never;
    const out = await evalRepo.createQuestion(
      { question: "What is X?", expectedDocumentIds: ["d1", "d2"], referenceAnswer: "X is Y" },
      db,
    );
    expect(out).toEqual({ id: "q1" });
    expect(inserted).toMatchObject({
      question: "What is X?",
      expectedDocumentIds: ["d1", "d2"],
      referenceAnswer: "X is Y",
    });
  });
});

describe("evalRepo.updateQuestion", () => {
  it("returns true when a row was updated", async () => {
    let setValues: unknown;
    const db = {
      update: () => ({
        set: (v: unknown) => {
          setValues = v;
          return { where: () => ({ returning: async () => [{ id: "q1" }] }) };
        },
      }),
    } as never;
    const ok = await evalRepo.updateQuestion(
      "q1",
      { question: "Updated?", expectedDocumentIds: ["d3"], referenceAnswer: null },
      db,
    );
    expect(ok).toBe(true);
    expect(setValues).toMatchObject({ question: "Updated?", expectedDocumentIds: ["d3"], referenceAnswer: null });
  });

  it("returns false when nothing was updated", async () => {
    const db = { update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }) } as never;
    const ok = await evalRepo.updateQuestion("q1", { question: "x", expectedDocumentIds: [], referenceAnswer: null }, db);
    expect(ok).toBe(false);
  });
});

describe("evalRepo.deleteQuestion", () => {
  it("returns true when a row was deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [{ id: "q1" }] }) }) } as never;
    expect(await evalRepo.deleteQuestion("q1", db)).toBe(true);
  });

  it("returns false when nothing was deleted", async () => {
    const db = { delete: () => ({ where: () => ({ returning: async () => [] }) }) } as never;
    expect(await evalRepo.deleteQuestion("q1", db)).toBe(false);
  });
});

describe("evalRepo.createRun", () => {
  it("reaps stale runs, then inserts a pending run with the snapshot and returns its id", async () => {
    let inserted: unknown;
    let reapCalled = false;
    const db = {
      // createRun now reaps stale runs before inserting (api-only has no admin
      // panel and never calls listRuns, so createRun is the only lazy-expiry
      // hook it gets); the fake must answer this update chain too, or the call
      // throws before the insert this test is actually about is ever reached.
      update: () => ({
        set: () => ({
          where: async () => {
            reapCalled = true;
          },
        }),
      }),
      insert: () => ({
        values: (v: unknown) => {
          inserted = v;
          return { returning: async () => [{ id: "id-1" }] };
        },
      }),
    } as never;
    const out = await evalRepo.createRun({ topK: 5 } as never, db);
    expect(reapCalled).toBe(true);
    expect(out).toEqual({ id: "id-1" });
    expect(inserted).toMatchObject({ status: "pending", settingsSnapshot: { topK: 5 } });
  });
});

describe("evalRepo.setRunStatus", () => {
  it("sets the given status", async () => {
    let setValues: unknown;
    const db = {
      update: () => ({
        set: (v: unknown) => {
          setValues = v;
          return { where: async () => undefined };
        },
      }),
    } as never;
    await evalRepo.setRunStatus("run-1", "running", db);
    expect(setValues).toMatchObject({ status: "running" });
  });
});

describe("evalRepo.finishRun", () => {
  it("sets status done and stores the aggregate", async () => {
    let setValues: unknown;
    const aggregate = { avgRecall: 0.9, avgPrecision: 0.8, avgMrr: 0.7, avgJudgeScore: 4.2, passRate: 0.95, questionCount: 10 };
    const db = {
      update: () => ({
        set: (v: unknown) => {
          setValues = v;
          return { where: async () => undefined };
        },
      }),
    } as never;
    await evalRepo.finishRun("run-1", aggregate as never, db);
    expect(setValues).toMatchObject({ status: "done", aggregate });
  });
});

describe("evalRepo.failRun", () => {
  it("sets status error and stores the error message", async () => {
    let setValues: unknown;
    const db = {
      update: () => ({
        set: (v: unknown) => {
          setValues = v;
          return { where: async () => undefined };
        },
      }),
    } as never;
    await evalRepo.failRun("run-1", "boom", db);
    expect(setValues).toMatchObject({ status: "error", error: "boom" });
  });
});

describe("evalRepo.listRuns", () => {
  it("reaps stale runs, then returns runs ordered by createdAt desc", async () => {
    const rows = [{ id: "run-1", status: "done", settingsSnapshot: { topK: 5 }, aggregate: null, error: null, createdAt: new Date(0) }];
    let reapCalled = false;
    const db = {
      // listRuns is what heals the admin panel within a single poll tick, so it
      // must reap before it selects; the fake needs to answer that update chain
      // or the call throws before the select this test is actually about.
      update: () => ({
        set: () => ({
          where: async () => {
            reapCalled = true;
          },
        }),
      }),
      select: () => ({ from: () => ({ orderBy: async () => rows }) }),
    } as never;
    expect(await evalRepo.listRuns(db)).toEqual(rows);
    expect(reapCalled).toBe(true);
  });
});

describe("evalRepo.reapStaleRuns", () => {
  it("issues a single UPDATE scoped to pending/running runs whose heartbeat is stale", async () => {
    let updatedTable: unknown;
    let setValues: unknown;
    let whereCondition: unknown;
    const db = {
      update: (table: unknown) => {
        updatedTable = table;
        return {
          set: (v: unknown) => {
            setValues = v;
            return {
              where: (cond: unknown) => {
                whereCondition = cond;
                return Promise.resolve(undefined);
              },
            };
          },
        };
      },
    } as never;
    await evalRepo.reapStaleRuns(db);
    expect(updatedTable).toBe(evalRuns);
    expect(setValues).toMatchObject({ status: "error", error: STALE_RUN_MESSAGE });
    // and(...) over an inArray + lt is opaque as a plain object; just confirm a
    // WHERE was actually supplied rather than the UPDATE running unconditionally.
    expect(whereCondition).toBeDefined();
  });
});

describe("evalRepo.getRun", () => {
  it("returns the run when found", async () => {
    const row = { id: "run-1", status: "pending", settingsSnapshot: { topK: 5 }, aggregate: null, error: null, createdAt: new Date(0) };
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) } as never;
    expect(await evalRepo.getRun("run-1", db)).toEqual(row);
  });

  it("returns null when not found", async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as never;
    expect(await evalRepo.getRun("run-1", db)).toBeNull();
  });
});

describe("evalRepo.getResults", () => {
  it("returns results for the given run", async () => {
    const rows = [
      {
        id: "res-1", questionId: "q1", questionText: "Q?", retrieved: [], hit: true,
        recall: 1, precision: 1, mrr: 1, judgeScore: 5, judgeRationale: "ok", generatedAnswer: "A", error: null,
      },
    ];
    const db = { select: () => ({ from: () => ({ where: async () => rows }) }) } as never;
    expect(await evalRepo.getResults("run-1", db)).toEqual(rows);
  });
});

describe("evalRepo.addResult", () => {
  const input = {
    runId: "run-1",
    questionId: "q1",
    questionText: "What is X?",
    retrieved: [{ documentId: "d1", filename: "a.pdf", score: 0.9 }],
    hit: true,
    recall: 1,
    precision: 0.5,
    mrr: 1,
    judgeScore: 4,
    judgeRationale: "Good answer",
    generatedAnswer: "X is Y",
    error: null,
  };

  it("inserts a fully-populated result, then touches the run's heartbeat by id", async () => {
    let inserted: unknown;
    let updatedTable: unknown;
    let setValues: unknown;
    let whereCondition: unknown;
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserted = v;
          return Promise.resolve(undefined);
        },
      }),
      update: (table: unknown) => {
        updatedTable = table;
        return {
          set: (v: unknown) => {
            setValues = v;
            return {
              where: (cond: unknown) => {
                whereCondition = cond;
                return Promise.resolve(undefined);
              },
            };
          },
        };
      },
    } as never;
    await evalRepo.addResult(input as never, db);
    expect(inserted).toMatchObject(input);
    // Not just "some update happened": the right table, with a heartbeat value,
    // scoped to exactly this run. A dropped `where` (which would touch every
    // run) or a wrong id would fail this.
    expect(updatedTable).toBe(evalRuns);
    expect(setValues).toHaveProperty("heartbeatAt");
    expect(whereCondition).toEqual(eq(evalRuns.id, input.runId));
  });

  it("does not let a heartbeat-write failure propagate out of addResult", async () => {
    let inserted: unknown;
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserted = v;
          return Promise.resolve(undefined);
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => {
            throw new Error("heartbeat db down");
          },
        }),
      }),
    } as never;
    // The insert already committed by the time the heartbeat write throws.
    // addResult must still resolve, not reject -- callers (run.ts) rely on that
    // to tell "the result is stored" from "it isn't" without a second, spurious
    // write.
    await expect(evalRepo.addResult(input as never, db)).resolves.toBeUndefined();
    expect(inserted).toMatchObject(input);
  });
});
