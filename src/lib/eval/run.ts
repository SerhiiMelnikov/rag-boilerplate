import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { prepareContext } from "@/lib/rag/answer";
import { getChatModel } from "@/lib/providers";
import { computeRetrievalMetrics, aggregateResults, type AggregateInput } from "./metrics";
import { judgeAnswer } from "./judge";
import { evalRepo, type EvalRepo } from "./repo";
import type { RetrievedDoc } from "./types";

export interface EvalRunDeps {
  prepareContextFn?: typeof prepareContext;
  generateAnswer?: (context: string, question: string, settings: RuntimeSettings) => Promise<string>;
  judge?: typeof judgeAnswer;
  repo?: EvalRepo;
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
    (async (context: string, question: string, s: RuntimeSettings) => {
      const { text } = await generateText({
        model: getChatModel(s, "Answer evaluation"),
        system: `${s.systemPrompt}\n\nUse the following context to answer the user's question. If the answer is not in the context, say you don't know.\n\nContext:\n${context}`,
        messages: [{ role: "user", content: question }],
        temperature: s.temperature,
      });
      return text;
    });

  try {
    await repo.setRunStatus(runId, "running");
    const questions = await repo.listQuestions();
    const forAgg: AggregateInput[] = [];
    for (const q of questions) {
      try {
        const prepared = await prepareContextFn(q.question, settings, {});
        const m = computeRetrievalMetrics(uniqueDocIds(prepared.sources), q.expectedDocumentIds);
        const answer = prepared.hasContext ? await generateAnswer(prepared.context, q.question, settings) : "";
        const judged = await judge({ question: q.question, context: prepared.context, answer, reference: q.referenceAnswer }, settings);
        await repo.addResult({
          runId, questionId: q.id, questionText: q.question, retrieved: dedupRetrieved(prepared.sources),
          hit: m.hit, recall: m.recall, precision: m.precision, mrr: m.mrr,
          judgeScore: judged.score, judgeRationale: judged.rationale, generatedAnswer: answer, error: null,
        });
        forAgg.push({ recall: m.recall, precision: m.precision, mrr: m.mrr, judgeScore: judged.score });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await repo.addResult({
          runId, questionId: q.id, questionText: q.question, retrieved: [],
          hit: false, recall: 0, precision: 0, mrr: 0,
          judgeScore: null, judgeRationale: null, generatedAnswer: null, error: message,
        });
        forAgg.push({ recall: 0, precision: 0, mrr: 0, judgeScore: null });
      }
    }
    await repo.finishRun(runId, aggregateResults(forAgg));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.failRun(runId, message);
  }
}
