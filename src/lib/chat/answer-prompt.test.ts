import { describe, it, expect } from "vitest";
import { buildAnswerSystemPrompt, GROUNDING_RULE, NO_PASSAGES_NOTE } from "./answer-prompt";

describe("buildAnswerSystemPrompt", () => {
  it("opens with the admin's own system prompt, verbatim", () => {
    const out = buildAnswerSystemPrompt({ systemPrompt: "You are Ada.", context: "c", hasContext: true });
    expect(out.startsWith("You are Ada.")).toBe(true);
  });

  it("passes an admin prompt through untouched, including newlines and punctuation", () => {
    const weird = "Rule 1: be terse.\n\nRule 2: cite {sources} — always.";
    const out = buildAnswerSystemPrompt({ systemPrompt: weird, context: "c", hasContext: true });
    expect(out).toContain(weird);
  });

  it("always carries the grounding rule", () => {
    const withCtx = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "c", hasContext: true });
    const without = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "", hasContext: false });
    expect(withCtx).toContain(GROUNDING_RULE);
    expect(without).toContain(GROUNDING_RULE);
  });

  it("includes the retrieved context under a Context heading when there is context", () => {
    const out = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "cats are animals", hasContext: true });
    expect(out).toContain("Context:");
    expect(out).toContain("cats are animals");
    expect(out).not.toContain(NO_PASSAGES_NOTE);
  });

  it("says no passages matched, and emits no Context heading, when there is none", () => {
    const out = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "", hasContext: false });
    expect(out).toContain(NO_PASSAGES_NOTE);
    expect(out).not.toContain("Context:");
  });

  // The whole point of the change: the rule must scope to factual claims, not to
  // every utterance. A rule that still forbids talking about the conversation
  // would reproduce the defect this package exists to fix.
  it("permits discussing the conversation and forbids answering facts from general knowledge", () => {
    expect(GROUNDING_RULE).toMatch(/conversation/i);
    expect(GROUNDING_RULE).toMatch(/general knowledge/i);
  });

  it("is deterministic for the same input", () => {
    const a = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "c", hasContext: true });
    const b = buildAnswerSystemPrompt({ systemPrompt: "sp", context: "c", hasContext: true });
    expect(a).toBe(b);
  });
});
