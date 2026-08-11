import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { prepareContext } from "@/lib/rag/answer";
import { getChatModel } from "@/lib/providers";
import { buildAnswerSystemPrompt } from "@/lib/chat/answer-prompt";
import { computeRetrievalMetrics, aggregateResults, type AggregateInput } from "./metrics";
import { judgeAnswer } from "./judge";
import { evalRepo, type EvalRepo, type QuestionRow } from "./repo";
import type { RetrievedDoc } from "./types";

export interface EvalRunDeps {
  prepareContextFn?: typeof prepareContext;
  /** Takes an already-composed system prompt — see buildAnswerSystemPrompt. */
  generateAnswer?: (system: string, question: string, settings: RuntimeSettings) => Promise<string>;
  judge?: typeof judgeAnswer;
  repo?: EvalRepo;
  /**
   * Pre-fetched golden questions, so a caller that already called
   * listQuestions() (e.g. the CLI, for its zero-question guard and its
   * "Running N question(s)" message) doesn't pay for the round trip twice.
   * Omit to have runEvaluation fetch them itself — the admin panel's
   * background path does this.
   */
  questions?: QuestionRow[];
}

// Unique documentIds in retrieval rank order (retrieval returns one entry per chunk).
function uniqueDocIds(sources: Array<{ documentId: string }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) if (!seen.has(s.documentId)) { seen.add(s.documentId); out.push(s.documentId); }
  return out;
}

// First-occurrence unique docs (id+filename+score) for display in the run detail.
function dedupRetrieved(sources: Array<{ documentId: string; filename: string; score: number }>): RetrievedDoc[] {
  const seen = new Set<string>();
  const out: RetrievedDoc[] = [];
  for (const s of sources) if (!seen.has(s.documentId)) { seen.add(s.documentId); out.push({ documentId: s.documentId, filename: s.filename, score: s.score }); }
  return out;
}

export async function runEvaluation(runId: string, settings: RuntimeSettings, deps: EvalRunDeps = {}): Promise<void> {
  const repo = deps.repo ?? evalRepo;
  const prepareContextFn = deps.prepareContextFn ?? prepareContext;
  const judge = deps.judge ?? judgeAnswer;
  const generateAnswer =
    deps.generateAnswer ??
    (async (system: string, question: string, s: RuntimeSettings) => {
      const { text } = await generateText({
        model: getChatModel(s, "Answer evaluation"),
        system,
        messages: [{ role: "user", content: question }],
        temperature: s.temperature,
      });
      return text;
    });

  try {
    await repo.setRunStatus(runId, "running");
    const questions = deps.questions ?? (await repo.listQuestions());
    const forAgg: AggregateInput[] = [];
    for (const q of questions) {
      let prepared: Awaited<ReturnType<typeof prepareContextFn>>;
      let m: ReturnType<typeof computeRetrievalMetrics>;
      let answer: string;
      let judged: Awaited<ReturnType<typeof judge>>;
      try {
        prepared = await prepareContextFn(q.question, settings, {});
        m = computeRetrievalMetrics(uniqueDocIds(prepared.sources), q.expectedDocumentIds);
        // hasContext is literally true here: this branch only runs when it is. Eval
        // deliberately keeps its no-context guard even though the chat handler dropped
        // its own — a golden question whose documents were never retrieved must score
        // as an empty answer, not receive a conversational one.
        answer = prepared.hasContext
          ? await generateAnswer(
              buildAnswerSystemPrompt({
                systemPrompt: settings.systemPrompt,
                context: prepared.context,
                hasContext: true,
              }),
              q.question,
              settings,
            )
          : "";
        judged = await judge({ question: q.question, context: prepared.context, answer, reference: q.referenceAnswer }, settings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // If the database is the thing that's failing, this write throws too. Left
        // unguarded it sinks the whole run — including the questions that already
        // succeeded, whose rows would be left with no aggregate to attribute them
        // to. Log and move on instead, and skip the aggregate entry as well so the
        // aggregate keeps describing exactly the rows that were actually stored.
        try {
          await repo.addResult({
            runId, questionId: q.id, questionText: q.question, retrieved: [],
            hit: false, recall: 0, precision: 0, mrr: 0,
            judgeScore: null, judgeRationale: null, generatedAnswer: null, error: message,
          });
          forAgg.push({ recall: 0, precision: 0, mrr: 0, judgeScore: null });
        } catch (writeErr) {
          console.error(`eval: could not record the failure of question ${q.id}`, writeErr);
        }
        continue;
      }

      // The write is deliberately OUTSIDE the compute try above. Sharing one catch
      // with prepareContext/generateAnswer/judge let a transient write failure be
      // recorded as though the question itself had failed -- a synthetic error row
      // written over a result that was in fact computed correctly, plus a zero
      // pushed into the aggregate for a question that actually scored. When only
      // this write fails: log it and add nothing to forAgg, same rule the catch
      // above already follows -- the aggregate describes exactly the rows that were
      // actually stored, and there is no error to describe here, because nothing
      // went wrong with the evaluation itself.
      try {
        await repo.addResult({
          runId, questionId: q.id, questionText: q.question, retrieved: dedupRetrieved(prepared.sources),
          hit: m.hit, recall: m.recall, precision: m.precision, mrr: m.mrr,
          judgeScore: judged.score, judgeRationale: judged.rationale, generatedAnswer: answer, error: null,
        });
        forAgg.push({ recall: m.recall, precision: m.precision, mrr: m.mrr, judgeScore: judged.score });
      } catch (writeErr) {
        console.error(`eval: could not record the result of question ${q.id}`, writeErr);
      }
    }
    await repo.finishRun(runId, aggregateResults(forAgg));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.failRun(runId, message);
  }
}
