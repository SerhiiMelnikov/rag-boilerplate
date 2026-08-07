import { describe, it, expect } from "vitest";
import { imageAnswerText, CAPTION_CAP } from "./image-answer";

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
});
