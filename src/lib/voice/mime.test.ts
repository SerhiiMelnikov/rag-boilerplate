import { describe, it, expect } from "vitest";
import { pickMimeType, MIME_PREFERENCE } from "./mime";

const supporting = (...types: string[]) => (t: string) => types.includes(t);

describe("pickMimeType", () => {
  it("prefers opus in webm when everything is supported", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to plain webm", () => {
    expect(pickMimeType(supporting("audio/webm"))).toBe("audio/webm");
  });

  it("reaches audio/mp4 on a Safari-shaped browser", () => {
    expect(pickMimeType(supporting("audio/mp4"))).toBe("audio/mp4");
  });

  it("returns null when nothing is supported", () => {
    expect(pickMimeType(() => false)).toBeNull();
  });

  // These three pin the RELATIVE order of every adjacent pair with a literal
  // expectation, deliberately not read back from MIME_PREFERENCE. The "prefers
  // opus..." test above only anchors index 0 against everything else — it says
  // nothing about the order among the remaining three, so a regression that
  // swapped two of them (e.g. promoted the unverified audio/mp4 above the
  // verified audio/webm) would pass every test in this file except these.
  // That specific swap is the one that matters: Chrome and Firefox offer both
  // audio/webm and audio/mp4, and audio/webm;codecs=opus is the only container
  // verified end to end against a real provider (see the comment in mime.ts) —
  // silently sending Chrome's recordings in audio/mp4 instead would be a
  // regression no other test here can see.
  it("prefers opus-in-webm over plain webm when both are offered", () => {
    expect(pickMimeType(supporting("audio/webm;codecs=opus", "audio/webm"))).toBe("audio/webm;codecs=opus");
  });

  it("prefers webm over mp4 when both are offered", () => {
    expect(pickMimeType(supporting("audio/webm", "audio/mp4"))).toBe("audio/webm");
  });

  it("prefers mp4 over ogg when both are offered", () => {
    expect(pickMimeType(supporting("audio/mp4", "audio/ogg;codecs=opus"))).toBe("audio/mp4");
  });

  // Distinct from the pairwise tests above: this proves pickMimeType stops
  // probing once it finds a hit, rather than checking every entry and picking
  // the best afterwards. It reads its own expectation back from
  // MIME_PREFERENCE, so it cannot detect a reordering of that array — the
  // pairwise tests above are what carry that weight.
  it("does not probe types after the first hit", () => {
    const asked: string[] = [];
    pickMimeType((t) => { asked.push(t); return t === "audio/mp4"; });
    expect(asked).toEqual(MIME_PREFERENCE.slice(0, MIME_PREFERENCE.indexOf("audio/mp4") + 1));
  });
});
