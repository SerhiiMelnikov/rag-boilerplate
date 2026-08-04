// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SPEAK_ANSWERS_KEY, readSpeakAnswers, writeSpeakAnswers } from "./preference";

describe("speak-answers preference", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("is off when nothing was ever stored", () => {
    expect(readSpeakAnswers()).toBe(false);
  });

  it("round-trips on and off", () => {
    writeSpeakAnswers(true);
    expect(readSpeakAnswers()).toBe(true);
    writeSpeakAnswers(false);
    expect(readSpeakAnswers()).toBe(false);
  });

  it("is off when the stored value is not one we wrote", () => {
    localStorage.setItem(SPEAK_ANSWERS_KEY, "yes please");
    expect(readSpeakAnswers()).toBe(false);
  });

  // Safari in private mode throws on access. The chat must not care.
  it("is off, and does not throw, when storage itself throws", () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
    });
    expect(() => readSpeakAnswers()).not.toThrow();
    expect(readSpeakAnswers()).toBe(false);
    expect(() => writeSpeakAnswers(true)).not.toThrow();
  });
});
