import { eq, desc } from "drizzle-orm";
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
  getRun(id: string, database?: typeof defaultDb): Promise<RunRow | null>;
  getResults(runId: string, database?: typeof defaultDb): Promise<ResultRow[]>;
  addResult(input: ResultInput, database?: typeof defaultDb): Promise<void>;
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
    const [r] = await database.insert(evalRuns).values({ status: "pending", settingsSnapshot: snapshot }).returning({ id: evalRuns.id });
    return r;
  },
  async setRunStatus(id, status, database = defaultDb) {
    await database.update(evalRuns).set({ status }).where(eq(evalRuns.id, id));
  },
  async finishRun(id, aggregate, database = defaultDb) {
    await database.update(evalRuns).set({ status: "done", aggregate }).where(eq(evalRuns.id, id));
  },
  async failRun(id, error, database = defaultDb) {
    await database.update(evalRuns).set({ status: "error", error }).where(eq(evalRuns.id, id));
  },
  async listRuns(database = defaultDb) {
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
  },
};
