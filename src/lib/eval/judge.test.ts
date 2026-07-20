import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { judgeAnswer } from "./judge";
import { MissingProviderKeyError } from "@/lib/providers/types";

const settings = {} as never;
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const input = { question: "q", context: "ctx", answer: "a", reference: null };

describe("judgeAnswer", () => {
  it("parses a valid score line", async () => {
    const r = await judgeAnswer(input, settings, { generate: async () => "SCORE: 5 | grounded and correct" });
    expect(r).toEqual({ score: 5, rationale: "grounded and correct" });
  });
  it("neutral 3 on an unparseable reply", async () => {
    const r = await judgeAnswer(input, settings, { generate: async () => "it seems fine" });
    expect(r.score).toBe(3);
    expect(console.warn).toHaveBeenCalled();
  });
  it("neutral 3 on an out-of-range score", async () => {
    const r = await judgeAnswer(input, settings, { generate: async () => "SCORE: 9 | too high" });
    expect(r.score).toBe(3);
  });
  it("propagates provider errors so the run records them", async () => {
    await expect(
      judgeAnswer(input, settings, { generate: async () => { throw new MissingProviderKeyError("Chat", "openai"); } }),
    ).rejects.toBeInstanceOf(MissingProviderKeyError);
  });
});
