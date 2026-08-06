import { describe, it, expect } from "vitest";
import { detectSpeechLang } from "./lang";

describe("detectSpeechLang", () => {
  it("returns uk-UA for Cyrillic text", () => {
    expect(detectSpeechLang("Скільки документів у базі знань?")).toBe("uk-UA");
  });

  it("returns null for Latin text so the caller can fall back", () => {
    expect(detectSpeechLang("How many documents are in the knowledge base?")).toBeNull();
  });

  it("resolves a mixed sentence by majority", () => {
    expect(detectSpeechLang("Документ PDF успішно оброблено")).toBe("uk-UA");
    expect(detectSpeechLang("The файл was uploaded successfully to the store")).toBeNull();
  });

  it("returns null when there are no letters at all", () => {
    expect(detectSpeechLang("")).toBeNull();
    expect(detectSpeechLang("1. 2. 3. — 42%")).toBeNull();
  });

  it("ignores digits and punctuation when counting", () => {
    expect(detectSpeechLang("Так — 100%")).toBe("uk-UA");
  });

  it("does not call a tie for Cyrillic", () => {
    // Two letters each way. A tie is not evidence, so the caller's fallback wins.
    expect(detectSpeechLang("ab го")).toBeNull();
  });
});
