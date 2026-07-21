import { z } from "zod";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { evalRepo, type EvalRepo, type QuestionInput } from "@/lib/eval/repo";

const bodySchema = z.object({
  question: z.string().trim().min(1),
  expectedDocumentIds: z.array(z.string()),
  referenceAnswer: z.string().optional(),
}).strict();

export interface QuestionsDeps {
  getAdmin?: typeof requireAdmin;
  repo?: EvalRepo;
}

// Parse + normalize a create/update body; returns null on invalid input.
function parseBody(body: unknown): QuestionInput | null {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return null;
  const referenceAnswer = parsed.data.referenceAnswer?.trim() ? parsed.data.referenceAnswer : null;
  return {
    question: parsed.data.question,
    expectedDocumentIds: parsed.data.expectedDocumentIds,
    referenceAnswer,
  };
}

export async function listQuestionsResponse(request: Request, deps: QuestionsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ questions: await repo.listQuestions() });
}

export async function createQuestionResponse(request: Request, deps: QuestionsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = parseBody(body);
  if (!input) return Response.json({ error: "question and expectedDocumentIds are required" }, { status: 400 });
  const { id } = await repo.createQuestion(input);
  return Response.json({ id }, { status: 201 });
}

export async function updateQuestionResponse(id: string, request: Request, deps: QuestionsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = parseBody(body);
  if (!input) return Response.json({ error: "question and expectedDocumentIds are required" }, { status: 400 });
  const updated = await repo.updateQuestion(id, input);
  if (!updated) return Response.json({ error: "Question not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function deleteQuestionResponse(id: string, request: Request, deps: QuestionsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const repo = deps.repo ?? evalRepo;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const deleted = await repo.deleteQuestion(id);
  if (!deleted) return Response.json({ error: "Question not found" }, { status: 404 });
  return Response.json({ ok: true });
}
