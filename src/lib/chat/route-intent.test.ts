import { describe, it, expect } from "vitest";
import { routeIntent } from "./route-intent";

const settings = {} as never;

describe("routeIntent", () => {
  it("parses an IMAGE classification into kind+query", async () => {
    const r = await routeIntent("show me a red bike", settings, { generate: async () => "IMAGE: red bicycle" });
    expect(r).toEqual({ kind: "image", query: "red bicycle" });
  });

  it("returns text for a TEXT classification", async () => {
    const r = await routeIntent("what is our refund policy?", settings, { generate: async () => "TEXT" });
    expect(r).toEqual({ kind: "text" });
  });

  it("falls back to the raw message when IMAGE has no description", async () => {
    const r = await routeIntent("show me", settings, { generate: async () => "IMAGE:" });
    expect(r).toEqual({ kind: "image", query: "show me" });
  });

  it("falls back to text when the model call throws", async () => {
    const r = await routeIntent("hi", settings, { generate: async () => { throw new Error("model down"); } });
    expect(r).toEqual({ kind: "text" });
  });
});
