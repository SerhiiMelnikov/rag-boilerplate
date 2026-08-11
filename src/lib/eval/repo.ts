import { eq, desc, sql, and, inArray, lt } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { evalQuestions, evalRuns, evalResults } from "@/lib/db/schema";
import type { EvalSettingsSnapshot, EvalAggregate, RetrievedDoc } from "./types";

export interface QuestionRow {
  id: string;
  question: string;
  expectedDocumentIds: string[];
  referenceAnswer: string | null;
  createdAt: Date;
}

export interface RunRow {
  id: string;
  status: "pending" | "running" | "done" | "error";
  settingsSnapshot: EvalSettingsSnapshot;
  aggregate: EvalAggregate | null;
  error: string | null;
  createdAt: Date;
  heartbeatAt: Date;
}

export interface ResultRow {
  id: string;
  questionId: string | null;
  questionText: string;
  retrieved: RetrievedDoc[];
  hit: boolean;
  recall: number;
  precision: number;
  mrr: number;
  judgeScore: number | null;
  judgeRationale: string | null;
  generatedAnswer: string | null;
  error: string | null;
}

export interface ResultInput extends Omit<ResultRow, "id"> {
  runId: string;
}

export interface QuestionInput {
  question: string;
  expectedDocumentIds: string[];
  referenceAnswer: string | null;
}

export interface EvalRepo {
  listQuestions(database?: typeof defaultDb): Promise<QuestionRow[]>;
  getQuestion(id: string, database?: typeof defaultDb): Promise<QuestionRow | null>;
  createQuestion(input: QuestionInput, database?: typeof defaultDb): Promise<{ id: string }>;
  updateQuestion(id: string, input: QuestionInput, database?: typeof defaultDb): Promise<boolean>;
  deleteQuestion(id: string, database?: typeof defaultDb): Promise<boolean>;
  createRun(snapshot: EvalSettingsSnapshot, database?: typeof defaultDb): Promise<{ id: string }>;
  setRunStatus(id: string, status: RunRow["status"], database?: typeof defaultDb): Promise<void>;
  finishRun(id: string, aggregate: EvalAggregate, database?: typeof defaultDb): Promise<void>;
  failRun(id: string, error: string, database?: typeof defaultDb): Promise<void>;
  listRuns(database?: typeof defaultDb): Promise<RunRow[]>;
  reapStaleRuns(database?: typeof defaultDb): Promise<void>;
  getRun(id: string, database?: typeof defaultDb): Promise<RunRow | null>;
  getResults(runId: string, database?: typeof defaultDb): Promise<ResultRow[]>;
  addResult(input: ResultInput, database?: typeof defaultDb): Promise<void>;
}

// How long a run may go without recording a question before it is presumed dead.
// A Ctrl-C'd `npm run eval`, or a server restart mid-run, leaves a row in
// "running" forever; the admin panel then polls the list AND the open run's detail
// every 2.5s for as long as the tab stays open.
//
// Ten minutes is far above any healthy per-question cost (one retrieval, one
// generation, one judge call) while staying inside a delay a person will wait out.
//
// Getting it wrong is cheap for the STORED ROW but not for the ADMIN PANEL -- the
// two do not recover the same way. The row self-heals: a live run that crosses
// the threshold on one slow question keeps writing, and finishRun sets "done"
// (clearing the reaper's `error`) when it actually completes, so a wrongly reaped
// run's database state ends up indistinguishable from one that was never reaped.
// The panel does not self-heal. The reap flips status to "error", which makes
// runs-panel.tsx's hasInFlight go false; its poll effect then clears the
// interval, and neither load() nor loadDetail() fires again, so RunStatusBadge is
// left showing a red "error" badge whose title (on hover) carries the
// interruption message, for a run that is, underneath, still executing and
// will finish normally. Concretely, and new on this branch (before
// the reap existed, a stalled run simply kept the panel polling until it filled
// in): a golden-set run that stalls past ten minutes on one question -- a
// provider's 429 back-off, a slow judge call -- shows the admin a false
// "Interrupted" error, freezes the live results table mid-run, and never brings
// the eventual "done" plus its aggregate to the screen without a manual reload.
// Raising this number trades fewer of those false alarms for a slower reclaim of
// truly dead runs; lowering it trades the other way.
export const STALE_RUN_TIMEOUT_MINUTES = 10;

// Shown verbatim in the admin panel. It must read as an interruption, not as an
// evaluation failure: nothing was wrong with the run's answers.
export const STALE_RUN_MESSAGE = "Interrupted — the run stopped reporting progress.";

// Lazy expiry: a read path that writes. Called from listRuns and createRun rather
// than from a scheduler, because this repo has no scheduler -- listRuns is what
// heals the admin panel (or any other client polling GET
// /api/admin/evaluation/runs; that route survives api-only pruning, so this is
// not admin-panel-only) within a single poll tick. createRun reaps too, as
// belt-and-braces for a caller that only ever POSTs a run and never lists one --
// e.g. the CLI's createRun -> getRun path in cli.ts never calls listRuns.
//
// now() is Postgres's clock, deliberately, never the JS process's: the CLI and the
// app can run on different machines, and the comparison must be between a stored
// database timestamp and the database's own idea of the present.
//
// A free function rather than a method the others call through `this`: evalRepo is
// an object literal, so `const { listRuns } = evalRepo` would leave `this`
// undefined and take the reap down with it at the first destructuring call site.
async function reapStaleRunsCore(database: typeof defaultDb): Promise<void> {
  await database
    .update(evalRuns)
    .set({ status: "error", error: STALE_RUN_MESSAGE })
    .where(
      and(
        inArray(evalRuns.status, ["pending", "running"]),
        lt(evalRuns.heartbeatAt, sql`now() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})`),
      ),
    );
}

export const evalRepo: EvalRepo = {
  async listQuestions(database = defaultDb) {
    return database.select().from(evalQuestions).orderBy(desc(evalQuestions.createdAt)) as unknown as QuestionRow[];
  },
  async getQuestion(id, database = defaultDb) {
    const [r] = await database.select().from(evalQuestions).where(eq(evalQuestions.id, id)).limit(1);
    return (r as QuestionRow) ?? null;
  },
  async createQuestion(input, database = defaultDb) {
    const [r] = await database
      .insert(evalQuestions)
      .values({ question: input.question, expectedDocumentIds: input.expectedDocumentIds, referenceAnswer: input.referenceAnswer })
      .returning({ id: evalQuestions.id });
    return r;
  },
  async updateQuestion(id, input, database = defaultDb) {
    const r = await database
      .update(evalQuestions)
      .set({ question: input.question, expectedDocumentIds: input.expectedDocumentIds, referenceAnswer: input.referenceAnswer })
      .where(eq(evalQuestions.id, id))
      .returning({ id: evalQuestions.id });
    return r.length > 0;
  },
  async deleteQuestion(id, database = defaultDb) {
    const r = await database.delete(evalQuestions).where(eq(evalQuestions.id, id)).returning({ id: evalQuestions.id });
    return r.length > 0;
  },
  async createRun(snapshot, database = defaultDb) {
    await reapStaleRunsCore(database);
    const [r] = await database.insert(evalRuns).values({ status: "pending", settingsSnapshot: snapshot }).returning({ id: evalRuns.id });
    return r;
  },
  async setRunStatus(id, status, database = defaultDb) {
    await database.update(evalRuns).set({ status }).where(eq(evalRuns.id, id));
  },
  async finishRun(id, aggregate, database = defaultDb) {
    // Invariant: `error` is non-null only when `status = 'error'`. Before the
    // reaper, that held for free -- failRun was the only writer of `error`, and
    // a run that failed never reached finishRun. reapStaleRuns broke that: it
    // writes `error` to a run that is still alive and can still complete, so a
    // falsely-reaped-then-completed run would otherwise land here as "done"
    // while still carrying STALE_RUN_MESSAGE. finishRun is now the place that
    // has to restore the invariant on every completion, hence the explicit
    // `error: null` alongside `status: "done"`.
    await database.update(evalRuns).set({ status: "done", aggregate, error: null }).where(eq(evalRuns.id, id));
  },
  async failRun(id, error, database = defaultDb) {
    await database.update(evalRuns).set({ status: "error", error }).where(eq(evalRuns.id, id));
  },
  async reapStaleRuns(database = defaultDb) {
    await reapStaleRunsCore(database);
  },
  async listRuns(database = defaultDb) {
    await reapStaleRunsCore(database);
    return database.select().from(evalRuns).orderBy(desc(evalRuns.createdAt)) as unknown as RunRow[];
  },
  async getRun(id, database = defaultDb) {
    const [r] = await database.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
    return (r as RunRow) ?? null;
  },
  async getResults(runId, database = defaultDb) {
    return database.select().from(evalResults).where(eq(evalResults.runId, runId)) as unknown as ResultRow[];
  },
  async addResult(input, database = defaultDb) {
    await database.insert(evalResults).values({
      runId: input.runId,
      questionId: input.questionId,
      questionText: input.questionText,
      retrieved: input.retrieved,
      hit: input.hit,
      recall: input.recall,
      precision: input.precision,
      mrr: input.mrr,
      judgeScore: input.judgeScore,
      judgeRationale: input.judgeRationale,
      generatedAnswer: input.generatedAnswer,
      error: input.error,
    });
    // Every recorded question -- a success or a recorded failure -- is progress.
    // This touch must never throw out of addResult: in run.ts, each call site
    // pushes into forAgg only once its addResult call has returned. If this
    // heartbeat write threw after the insert above already committed, addResult
    // would throw too -- the row would be stored but the question would never
    // reach forAgg, breaking the rule run.ts states: the aggregate
    // describes exactly the rows that were actually stored. Swallowing here keeps
    // addResult's contract simple and true: "the result is stored, and nothing
    // unrelated to storing it makes me throw" -- exactly what every caller
    // assumes. (This guard predates that rule and was originally added for a
    // different hazard: run.ts's per-question loop used to share one try/catch
    // across compute and the write, so a throw here would have looked like a
    // compute failure and triggered a second addResult call, inserting a
    // spurious duplicate eval_results row; a later commit split the write into
    // its own try whose catch only console.error's, closing that path, leaving
    // the aggregate-consistency reason above as the one that still applies.) The
    // cost of swallowing is only ever one stale heartbeat tick, which the next
    // question's addResult call corrects; a run reaped because of it is
    // non-destructive (it keeps writing, and finishRun sets it back to "done" --
    // clearing the reaper's `error` too -- when it actually completes, so the
    // finished row carries no trace of the false reap).
    try {
      await database.update(evalRuns).set({ heartbeatAt: sql`now()` }).where(eq(evalRuns.id, input.runId));
    } catch (err) {
      console.error(`eval: could not touch heartbeat for run ${input.runId}`, err);
    }
  },
};
