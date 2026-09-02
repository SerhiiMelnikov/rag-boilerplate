import { describe, it, expect } from "vitest";
import { parseDirs } from "./dirs";
describe("parseDirs", () => {
  it("splits on newlines, trims, drops empties", () => {
    expect(parseDirs("/a\n  /b  \n\n/c\n")).toEqual(["/a", "/b", "/c"]);
  });
  it("returns [] for blank", () => {
    expect(parseDirs("   \n ")).toEqual([]);
  });
});
