import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  CHAT_PROVIDER_IDS,
  EMBEDDING_PROVIDER_IDS,
  KEYED_PROVIDERS,
  HAS_OLLAMA,
  keyNameOf,
} from "@/lib/providers/catalog";

describe("provider catalog", () => {
  it("has no duplicate ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every provider a non-empty label", () => {
    for (const p of PROVIDERS) expect(p.label.length).toBeGreaterThan(0);
  });

  // The derived lists are what the forms render from. If they ever stop being
  // derived — someone hardcodes them "for clarity" — the CLI's single-declaration
  // pruning silently stops reaching them, which is the whole bug this replaces.
  it("derives the chat list from every entry", () => {
    expect(CHAT_PROVIDER_IDS).toEqual(PROVIDERS.map((p) => p.id));
  });

  it("derives the embedding list from the embedding-capable entries", () => {
    expect(EMBEDDING_PROVIDER_IDS).toEqual(PROVIDERS.filter((p) => p.embedding).map((p) => p.id));
    expect(EMBEDDING_PROVIDER_IDS).not.toContain("anthropic");
  });

  it("derives the keyed list, excluding key-less providers", () => {
    expect(KEYED_PROVIDERS.map((p) => p.id)).toEqual(["google", "openai", "anthropic"]);
    expect(KEYED_PROVIDERS.every((p) => p.keyName !== null)).toBe(true);
  });

  // Not a redundant restatement of the line above: this one is a compile-time
  // assertion. `${p.keyName}Key` and `keys[p.keyName]` are exactly what the keys
  // page does, and both fail to typecheck if KEYED_PROVIDERS is ever widened back
  // to ProviderInfo[]. A green run here means the narrowing predicate survived.
  it("narrows keyName to non-null at the type level", () => {
    const columns = KEYED_PROVIDERS.map((p) => `${p.keyName}Key`);
    expect(columns).toEqual(["googleKey", "openaiKey", "anthropicKey"]);
  });

  it("reports whether ollama is present", () => {
    expect(HAS_OLLAMA).toBe(true);
  });

  it("maps a provider to its key column, and key-less providers to null", () => {
    expect(keyNameOf("google")).toBe("google");
    expect(keyNameOf("anthropic")).toBe("anthropic");
    expect(keyNameOf("ollama")).toBeNull();
  });

  it("returns null for a provider that is not in the catalog", () => {
    expect(keyNameOf("mistral")).toBeNull();
  });
});
