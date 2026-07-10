import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyImageMatches } from "./verify";
import { MissingProviderKeyError } from "@/lib/providers/types";
import type { ImageSearchHit } from "./search";

// The verifier logs on the degraded paths; keep the test output pristine.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const settings = {} as never;

const HITS: ImageSearchHit[] = [
  { imageId: "i1", filename: "a.png", caption: "A young man with a beard", score: 0.26 },
  { imageId: "i2", filename: "b.png", caption: "A young woman on a bench", score: 0.22 },
  { imageId: "i3", filename: "c.png", caption: "A dark-themed user interface", score: 0.19 },
];

describe("verifyImageMatches", () => {
  it("keeps only the captions the model picks, in the model's order", async () => {
    const generate = vi.fn(async () => "3, 1");
    expect(await verifyImageMatches("a young man", HITS, settings, { generate })).toEqual([HITS[2], HITS[0]]);
  });

  it("shows the model the request and every caption, numbered from 1", async () => {
    const generate = vi.fn(async (_prompt: string) => "1");
    await verifyImageMatches("a young man", HITS, settings, { generate });
    const prompt = generate.mock.calls[0][0];
    expect(prompt).toContain("a young man");
    expect(prompt).toContain("1. A young man with a beard");
    expect(prompt).toContain("3. A dark-themed user interface");
  });

  it("returns [] when the model says NONE", async () => {
    const generate = vi.fn(async () => "NONE");
    expect(await verifyImageMatches("a red bicycle", HITS, settings, { generate })).toEqual([]);
  });

  it("ignores numbers outside the candidate range and de-duplicates", async () => {
    const generate = vi.fn(async () => "2, 2, 9, 0");
    expect(await verifyImageMatches("a woman", HITS, settings, { generate })).toEqual([HITS[1]]);
  });

  it("returns [] on unparseable output rather than vouching for unchecked images", async () => {
    const generate = vi.fn(async () => "I think maybe the first one?");
    expect(await verifyImageMatches("a young man", HITS, settings, { generate })).toEqual([]);
  });

  // Mining digits out of prose would invert the model's meaning here.
  it("refuses to mine digits out of a negated reply", async () => {
    const generate = vi.fn(async () => "Images 2 and 3 do NOT match, only 1 does");
    expect(await verifyImageMatches("a young man", HITS, settings, { generate })).toEqual([]);
  });

  it("treats a hedged NONE as no match", async () => {
    const generate = vi.fn(async () => "NONE of them match");
    expect(await verifyImageMatches("a red bicycle", HITS, settings, { generate })).toEqual([]);
  });

  it("degrades to [] on a transient model failure", async () => {
    const generate = vi.fn(async () => { throw new Error("rate limited"); });
    expect(await verifyImageMatches("a young man", HITS, settings, { generate })).toEqual([]);
  });

  // A bad/missing API key is an operator problem, not "no image matched" — the caller
  // reports it, so it must not be swallowed here.
  it("propagates provider errors instead of reporting no match", async () => {
    const generate = vi.fn(async () => { throw new MissingProviderKeyError("Chat", "openai"); });
    await expect(verifyImageMatches("a young man", HITS, settings, { generate })).rejects.toBeInstanceOf(MissingProviderKeyError);
  });

  it("bounds how much of a caption reaches the prompt", async () => {
    const generate = vi.fn(async (_prompt: string) => "1");
    const long = [{ ...HITS[0], caption: "x".repeat(2000) }];
    await verifyImageMatches("a young man", long, settings, { generate });
    expect(generate.mock.calls[0][0].length).toBeLessThan(1000);
  });

  it("does not call the model when there are no candidates", async () => {
    const generate = vi.fn();
    expect(await verifyImageMatches("anything", [], settings, { generate })).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
