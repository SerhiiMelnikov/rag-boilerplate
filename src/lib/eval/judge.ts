import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getChatModel } from "@/lib/providers";

// Bound what we paste into the prompt so a pathological answer/context can't blow up the request.
const MAX_LEN = 2000;

const JUDGE_PROMPT =
  "You grade an answer produced by a retrieval-augmented system. You are given the QUESTION, " +
  "the retrieved CONTEXT, the ANSWER, and optionally a REFERENCE answer. Score the answer from 1 to 5: " +
  "5 = fully correct, grounded in the context, and answers the question; 1 = wrong, unsupported, or off-topic. " +
  "If a REFERENCE is given, also weigh factual agreement with it. Reply with exactly one line: " +
  "\"SCORE: <n> | <a short reason>\", where <n> is an integer 1-5. Output only that line.";

export interface JudgeInput { question: string; context: string; answer: string; reference?: string | null }
export interface JudgeResult { score: number; rationale: string }
export interface JudgeDeps { generate?: (prompt: string) => Promise<string> }

// Never guesses beyond a neutral score: an unparseable or out-of-range reply yields 3 (with a
// logged warning) rather than throwing. Provider errors are NOT caught here — they propagate so
// the run records the failure against that question instead of silently scoring it neutral.
export async function judgeAnswer(input: JudgeInput, settings: RuntimeSettings, deps: JudgeDeps = {}): Promise<JudgeResult> {
  const generate =
    deps.generate ??
    (async (prompt: string) => {
      const { text } = await generateText({
        model: getChatModel(settings, "Answer evaluation"),
        messages: [
          { role: "system", content: JUDGE_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      });
      return text;
    });

  const parts = [
    `QUESTION: ${input.question.slice(0, MAX_LEN)}`,
    `CONTEXT: ${input.context.slice(0, MAX_LEN)}`,
    `ANSWER: ${input.answer.slice(0, MAX_LEN)}`,
  ];
  if (input.reference) parts.push(`REFERENCE: ${input.reference.slice(0, MAX_LEN)}`);

  const reply = (await generate(parts.join("\n\n"))).trim();
  const m = /^SCORE:\s*(\d+)\s*\|\s*(.*)$/i.exec(reply);
  if (m) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      return { score: n, rationale: m[2].trim() || "(no rationale)" };
    }
  }
  console.warn(`Unparseable judge reply: ${JSON.stringify(reply.slice(0, 120))}`);
  return { score: 3, rationale: "Unparseable judge reply; defaulted to neutral." };
}
