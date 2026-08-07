// The single source of the answer-time grounding rule. It exists here, and only
// here, because the chat handler and the eval harness must never drift: if eval
// scores answers against a different rule than production uses, nothing surfaces
// it. Two near-identical copies had already diverged before this file existed.
//
// The rule deliberately scopes to CLAIMS ABOUT THE KNOWLEDGE BASE rather than to
// every utterance. The previous wording ("answer using only the provided context;
// if the answer is not in the context, say you don't know") left the model no
// valid response to a question about the conversation itself — asked why it had
// chosen a particular image, it correctly answered "I don't know".
export const GROUNDING_RULE =
  "You may always talk about this conversation itself — what you answered earlier, " +
  "why you showed what you showed, what you are able and unable to do, and rephrasing " +
  "or clarifying an earlier answer. When you state a fact about the world or about the " +
  "user's documents, it must come from the provided context. If the provided context " +
  "does not cover what was asked, say so plainly; do not answer it from your own " +
  "general knowledge, and do not guess.";

// Emitted instead of an empty "Context:" heading. A bare heading with nothing under
// it reads to the model as a formatting accident; this states the situation outright.
export const NO_PASSAGES_NOTE =
  "No passages from the knowledge base matched this question. You may still respond " +
  "conversationally — about this conversation, or about what you can and cannot do — " +
  "but do not answer a factual question from your own general knowledge. Say that the " +
  "documents do not cover it.";

export interface AnswerPromptInput {
  /** The admin-editable prompt from settings, used verbatim and never rewritten. */
  systemPrompt: string;
  /** Retrieved passages. Ignored when hasContext is false. */
  context: string;
  hasContext: boolean;
}

export function buildAnswerSystemPrompt({ systemPrompt, context, hasContext }: AnswerPromptInput): string {
  const tail = hasContext ? `Context:\n${context}` : NO_PASSAGES_NOTE;
  return `${systemPrompt}\n\n${GROUNDING_RULE}\n\n${tail}`;
}
