import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { routeIntent } from "./route-intent";
import { MissingProviderKeyError } from "@/lib/providers/types";

const settings = {} as never;

// The router logs when it degrades; keep the test output pristine.
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

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

  // A transient failure (rate limit, timeout) still degrades to the text path, but it
  // must be visible: silently answering with text is how an exhausted quota looked
  // like "your question just wasn't about images".
  it("logs when it degrades to text after a failure", async () => {
    await routeIntent("show me a bike", settings, { generate: async () => { throw new Error("rate limited"); } });
    expect(console.error).toHaveBeenCalled();
  });

  // A bad/missing API key is an operator problem, not a text-intent classification.
  // The caller reports it, so it must not be swallowed here.
  it("propagates provider errors instead of pretending the request was text", async () => {
    await expect(
      routeIntent("show me a bike", settings, { generate: async () => { throw new MissingProviderKeyError("Chat", "openai"); } }),
    ).rejects.toBeInstanceOf(MissingProviderKeyError);
  });
});
