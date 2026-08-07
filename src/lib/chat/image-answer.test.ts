import { describe, it, expect } from "vitest";
import { imageAnswerText, CAPTION_CAP } from "./image-answer";
import { speakableText } from "../voice/speakable-text";
import { completedSentences } from "../voice/sentences";

const INTRO = "Here are the images that best match your description:";

describe("imageAnswerText", () => {
  it("returns the intro alone when there are no images", () => {
    expect(imageAnswerText(INTRO, [])).toBe(INTRO);
  });

  it("keeps only the first sentence of a multi-sentence caption", () => {
    const out = imageAnswerText(INTRO, [
      { caption: "A young man flexing his biceps. He is seated at a desk. The room is dim." },
    ]);
    expect(out).toContain("A young man flexing his biceps.");
    expect(out).not.toContain("seated at a desk");
  });

  it("lists one line per image, in the order given", () => {
    const out = imageAnswerText(INTRO, [{ caption: "First one." }, { caption: "Second one." }]);
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toEqual(["- First one.", "- Second one."]);
  });

  it("caps a caption with no sentence terminator and marks the truncation", () => {
    const long = "a".repeat(CAPTION_CAP + 40);
    const out = imageAnswerText(INTRO, [{ caption: long }]);
    const line = out.split("\n").find((l) => l.startsWith("- "))!;
    // "- " + CAPTION_CAP characters + the ellipsis
    expect(line.length).toBe(2 + CAPTION_CAP + 1);
    expect(line.endsWith("…")).toBe(true);
  });

  it("caps a first sentence that is itself longer than the limit", () => {
    const out = imageAnswerText(INTRO, [{ caption: `${"b".repeat(CAPTION_CAP + 10)}. Second sentence.` }]);
    const line = out.split("\n").find((l) => l.startsWith("- "))!;
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toContain("Second sentence");
  });

  it("leaves a short caption untouched, with no ellipsis", () => {
    const out = imageAnswerText(INTRO, [{ caption: "A red bicycle." }]);
    expect(out).toContain("- A red bicycle.");
    expect(out).not.toContain("…");
  });

  it("does not crash on an empty or whitespace-only caption", () => {
    const out = imageAnswerText(INTRO, [{ caption: "   " }]);
    expect(out.startsWith(INTRO)).toBe(true);
  });

  it("enforces the hardcoded 160-character limit", () => {
    // This test guards against changing CAPTION_CAP without updating the brief.
    expect(CAPTION_CAP).toBe(160);
    const long = "a".repeat(161);
    const out = imageAnswerText(INTRO, [{ caption: long }]);
    const line = out.split("\n").find((l) => l.startsWith("- "))!;
    // Should be "- " (2 chars) + 160 chars + "…" (1 char) = 163 total
    expect(line.length).toBe(163);
    expect(line).toBe("- " + "a".repeat(160) + "…");
  });

  it("separates caption lines with blank lines, not single newlines", () => {
    // This test guards against reverting the join separator. When a line ends
    // with no punctuation and is followed by another, speakableText will strip
    // the "- " marker. Without a blank line between them, completedSentences
    // will merge them into a single sentence.
    const out = imageAnswerText(INTRO, [
      { caption: "First caption" },
      { caption: "Second caption" },
    ]);
    // Should have blank lines (double newlines) between caption lines, not single
    expect(out).toContain("- First caption\n\n- Second caption");
    expect(out).not.toContain("- First caption\n- Second caption");
  });

  it("voice seam: captions without punctuation are separate spoken sentences", () => {
    // This is a cross-module test that verifies the real user-facing behavior:
    // two image captions without terminal punctuation should NOT be merged into
    // a run-on sentence when spoken aloud. imageAnswerText -> speakableText ->
    // completedSentences should yield two separate sentences.
    const out = imageAnswerText(INTRO, [
      { caption: "a red bicycle" },
      { caption: "a red sports car" },
    ]);

    // Feed through speakableText (which strips markdown/list markers)
    const speakable = speakableText(out);

    // Then through completedSentences with flush=true to finalize
    const sentences = completedSentences(speakable, { flush: true });

    // Should have at least 3: intro, first caption, second caption
    // (intro may or may not be joined with first depending on punctuation)
    const captionSentences = sentences.filter(
      (s) => s.includes("bicycle") || s.includes("sports car")
    );
    expect(captionSentences).toHaveLength(2);
    expect(captionSentences[0]).toContain("bicycle");
    expect(captionSentences[1]).toContain("sports car");
  });
});
