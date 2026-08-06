// The composite property the hook actually depends on: speakableText + completedSentences,
// applied together to a GROWING prefix of streamed markdown, must never change a sentence
// that was already returned. Each task tested its own half of this in isolation
// (sentences.test.ts on raw text only, use-spoken-answer.test.tsx without a URL in the
// answer) and neither caught the composite failure: a delta that lands mid-URL makes
// isSentenceEnd treat "end of arrived text" as a terminator, the URL rule then collapses
// the whole URL into a single word "link" once it fully arrives, and the sentence that was
// already spoken gets spoken again in its final, longer form.
import { describe, it, expect } from "vitest";
import { speakableText } from "./speakable-text";
import { completedSentences } from "./sentences";

// Simulates streaming the given full markdown text one character at a time (the
// worst-case, finest-grained delta boundary) through the real pipeline the hook uses,
// and asserts every previously-returned sentence array is a prefix of the next one.
function assertStableUnderStreaming(full: string): void {
  let prev: string[] = [];
  for (let i = 1; i <= full.length; i++) {
    const flush = i === full.length;
    const sentences = completedSentences(speakableText(full.slice(0, i)), { flush });
    expect(sentences.slice(0, prev.length)).toEqual(prev);
    prev = sentences;
  }
}

describe("speakableText + completedSentences composition", () => {
  it("keeps every emitted sentence stable while a bare URL streams in", () => {
    assertStableUnderStreaming(
      "Read the guide at https://docs.example.com/x then start. It works well."
    );
  });

  it("keeps every emitted sentence stable while a markdown link streams in", () => {
    assertStableUnderStreaming(
      "See [the docs](https://docs.example.com/x) for details. That should help."
    );
  });

  it("keeps every emitted sentence stable while a parenthesised citation streams in", () => {
    assertStableUnderStreaming(
      "This is documented (see https://docs.example.com/x for the source). Good."
    );
  });

  it("stays stable while a parenthesised URL streams in", () => {
    // The last URL-shaped change to speakableText broke exactly this and a clause
    // was spoken twice on every answer that cited a source.
    assertStableUnderStreaming("See https://en.wikipedia.org/wiki/Foo_(bar) for more. Then stop.");
  });

  it("stays stable when the paren closes the sentence rather than the URL", () => {
    assertStableUnderStreaming("(see https://example.com) for more. Then stop.");
  });
});
