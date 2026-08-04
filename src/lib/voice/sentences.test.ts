import { describe, it, expect } from "vitest";
import { completedSentences } from "./sentences";

describe("completedSentences", () => {
  it("returns finished sentences and withholds the trailing fragment", () => {
    expect(completedSentences("One. Two! Three")).toEqual(["One.", "Two!"]);
  });

  it("returns the fragment when flushing at the end of the stream", () => {
    expect(completedSentences("One. Two", { flush: true })).toEqual(["One.", "Two"]);
  });

  it("treats the end of input as an end when it terminates", () => {
    expect(completedSentences("Only one.")).toEqual(["Only one."]);
  });

  // The reason this function exists rather than a bare split on ".".
  it("does not end a sentence inside a decimal or a version", () => {
    expect(completedSentences("It scored 3.5 today.")).toEqual(["It scored 3.5 today."]);
    expect(completedSentences("Use v1.2 now.")).toEqual(["Use v1.2 now."]);
  });

  it("does not end a sentence at a known abbreviation", () => {
    expect(completedSentences("Use it, e.g. here. Done.")).toEqual(["Use it, e.g. here.", "Done."]);
  });

  it("does not end a sentence at a single-letter initial", () => {
    expect(completedSentences("Ask A. Smith first. Then go.")).toEqual(["Ask A. Smith first.", "Then go."]);
  });

  it("treats a blank line as an end, so a heading is spoken as its own unit", () => {
    expect(completedSentences("Setup\n\nRun the script.")).toEqual(["Setup", "Run the script."]);
  });

  // The property the hook depends on: growth must not change what was already complete.
  it("keeps earlier sentences stable as the text grows", () => {
    const a = completedSentences("One. Two. Thr");
    const b = completedSentences("One. Two. Three. Fo");
    expect(b.slice(0, a.length)).toEqual(a);
  });

  it("returns nothing for text with no finished sentence", () => {
    expect(completedSentences("Still typing")).toEqual([]);
  });

  it("returns nothing for empty input, flushing or not", () => {
    expect(completedSentences("")).toEqual([]);
    expect(completedSentences("", { flush: true })).toEqual([]);
  });

  // Not in the brief, added after tracing the brief's own algorithm by hand: a
  // number that streams in one digit at a time is indistinguishable, at the
  // instant the buffer happens to end right after the dot, from a genuine
  // sentence ending in a bare number ("It scored 3." with nothing more coming).
  // The brief's isSentenceEnd treats "end of currently-arrived text" as an
  // implicit terminator whenever no letter/abbreviation token precedes the dot
  // (its regex only matches letters, not digits) — so it fired immediately on
  // "It scored 3." well before the "5" of "3.5" ever arrived, and the sentence
  // it emitted then does not appear anywhere in the eventual full-text parse.
  // This is the reversion guard: a bare digit-dot must not be returned early.
  it("withholds a bare trailing digit-dot instead of guessing it is not a decimal", () => {
    expect(completedSentences("It scored 3.")).toEqual([]);
  });

  // The actual stability proof for the case above: unlike the reversion guard,
  // this has a confirmed sentence ahead of the ambiguous digit-dot, so `a` is
  // non-empty and `b.slice(0, a.length)).toEqual(a)` is a real assertion that
  // "Intro." survived unchanged — not `[] === []`, which would pass no matter
  // what the fix did.
  it("keeps a confirmed sentence stable while a later decimal is still ambiguous", () => {
    const a = completedSentences("Intro. It scored 3.");
    const b = completedSentences("Intro. It scored 3.5 today.");
    expect(b.slice(0, a.length)).toEqual(a);
  });

  it("still flushes a sentence that genuinely ends on a bare number", () => {
    expect(completedSentences("It scored 3.", { flush: true })).toEqual(["It scored 3."]);
  });

  // ABBREVIATIONS previously included "no" for the numero sense ("No. 5"), but
  // a sentence genuinely ending in the word "No." is ordinary conversation and
  // far more common in a document-grounded assistant's answers; withholding it
  // until flush was the wrong tradeoff, so "no" was removed from the set.
  it("does not treat a sentence-ending 'No.' as the numero abbreviation", () => {
    expect(completedSentences("Is it possible? No. Try again.")).toEqual([
      "Is it possible?",
      "No.",
      "Try again.",
    ]);
  });
});
