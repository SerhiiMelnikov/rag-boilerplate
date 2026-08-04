import { describe, it, expect } from "vitest";
import { speakableText } from "./speakable-text";

describe("speakableText", () => {
  it("drops emphasis, strikethrough and inline-code markers but keeps the words", () => {
    expect(speakableText("**bold** and _em_ and ~~gone~~ and `code`")).toBe("bold and em and gone and code");
  });

  it("keeps snake_case intact", () => {
    expect(speakableText("call speak_answers now")).toBe("call speak_answers now");
  });

  it("names a fenced code block instead of reading it", () => {
    expect(speakableText("Before\n\n```ts\nconst x = 1;\n```\n\nAfter")).toContain("code block");
    expect(speakableText("```ts\nconst x = 1;\n```")).not.toContain("const");
  });

  // The streaming case: the fence has opened and has not closed yet.
  it("names an unclosed fence still arriving in the stream", () => {
    const partial = "Here is how:\n\n```ts\nconst secret = 1;\nconst more =";
    expect(speakableText(partial)).toContain("code block");
    expect(speakableText(partial)).not.toContain("secret");
  });

  it("names a table instead of reading its pipes", () => {
    const md = "Totals:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nDone.";
    const out = speakableText(md);
    expect(out).toContain("table");
    expect(out).not.toContain("|");
    expect(out).toContain("Done.");
  });

  it("speaks a link's text and not its URL", () => {
    expect(speakableText("see [the docs](https://example.com/a/b)")).toBe("see the docs");
  });

  it("replaces a bare URL with the word link", () => {
    expect(speakableText("go to https://example.com/a now")).toBe("go to link now");
  });

  it("speaks an image's alt text", () => {
    expect(speakableText("![a red bike](/x.png)")).toBe("a red bike");
  });

  it("drops heading, quote and list markers", () => {
    expect(speakableText("# Title")).toBe("Title");
    expect(speakableText("> quoted")).toBe("quoted");
    expect(speakableText("- one\n- two")).toBe("one\ntwo");
    expect(speakableText("1. one\n2. two")).toBe("one\ntwo");
  });

  it("keeps blank lines, because the sentence splitter treats them as boundaries", () => {
    expect(speakableText("One\n\nTwo")).toBe("One\n\nTwo");
  });

  it("collapses runs of spaces without eating newlines", () => {
    expect(speakableText("a    b\nc")).toBe("a b\nc");
  });

  it("leaves ordinary prose untouched", () => {
    const plain = "The answer stands on 3 passages. It cites them below.";
    expect(speakableText(plain)).toBe(plain);
  });
});
