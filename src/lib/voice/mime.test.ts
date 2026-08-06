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

  it("asks about every entry in preference order and stops at the first hit", () => {
    const asked: string[] = [];
    pickMimeType((t) => { asked.push(t); return t === "audio/mp4"; });
    expect(asked).toEqual(MIME_PREFERENCE.slice(0, MIME_PREFERENCE.indexOf("audio/mp4") + 1));
  });
});
