// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readSpeakAnswers, writeSpeakAnswers } from "./preference";

// This module is imported by a client component, which Next also renders on the
// server. Touching window there throws and takes the whole page with it.
describe("speak-answers preference on the server", () => {
  it("reads false and writes nothing without throwing", () => {
    expect(readSpeakAnswers()).toBe(false);
    expect(() => writeSpeakAnswers(true)).not.toThrow();
  });
});
