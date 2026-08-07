import type { ProviderId } from "./types";

// The three providers that authenticate with an API key. Ollama is deliberately
// absent: it takes a base URL, not a key. This alias is never narrowed by the
// CLI — a pruned provider's entry is gone from PROVIDERS, so no code path can
// name it, and leaving the alias wide is what removes the `never` collapse that
// the old transform needed two guards to avoid.
export type KeyName = "google" | "openai" | "anthropic";

export interface ProviderInfo {
  id: ProviderId;
  /** What an admin sees. */
  label: string;
  /** The settings column holding this provider's API key (`${keyName}Key`); null when key-less. */
  keyName: KeyName | null;
  /** Can this provider produce embeddings? */
  embedding: boolean;
  /** Can this provider turn speech into text? Anthropic has no audio input at
   *  all and Ollama serves no transcription API — neither is a gap to close. */
  speech: boolean;
}

// A provider that definitely has a key. Without this narrowing, `keys[p.keyName]`
// and `${p.keyName}Key` do not typecheck: keyName is nullable on ProviderInfo.
export interface KeyedProvider extends ProviderInfo {
  keyName: KeyName;
}

// The single source of truth for which providers exist.
//
// The CLI's provider pruning (cli/src/transforms/source.ts, pruneProviderCatalog)
// edits THIS declaration and nothing else in the admin surface. It requires the
// declaration to stay named `PROVIDERS`, to be initialised with an array literal,
// and for every entry to be an object literal with a string-literal `id`. It
// throws at scaffold time if any of that stops being true, rather than silently
// mangling a form the way its predecessor could.
export const PROVIDERS: ProviderInfo[] = [
  { id: "google", label: "Google", keyName: "google", embedding: true, speech: true },
  { id: "openai", label: "OpenAI", keyName: "openai", embedding: true, speech: true },
  { id: "anthropic", label: "Anthropic", keyName: "anthropic", embedding: false, speech: false },
  { id: "ollama", label: "Ollama", keyName: null, embedding: true, speech: false },
];

// Everything below is DERIVED. Never hardcode these — the CLI prunes PROVIDERS
// only, and a hardcoded copy would survive pruning and offer a provider the
// generated project does not ship.
export const CHAT_PROVIDER_IDS: string[] = PROVIDERS.map((p) => p.id);
export const EMBEDDING_PROVIDER_IDS: string[] = PROVIDERS.filter((p) => p.embedding).map((p) => p.id);
export const SPEECH_PROVIDER_IDS: string[] = PROVIDERS.filter((p) => p.speech).map((p) => p.id);
export const KEYED_PROVIDERS: KeyedProvider[] = PROVIDERS.filter(
  (p): p is KeyedProvider => p.keyName !== null,
);
// Not `p.id === "ollama"`: the CLI narrows ProviderId to the providers a
// generated project kept, so comparing a pruned id against a literal is a tsc
// error there (TS2367, "no overlap") even though it compiles fine here. Ollama
// is the only key-less provider, and being key-less is the property the keys
// page actually needs — it is what decides whether to ask for a base URL.
export const HAS_OLLAMA: boolean = PROVIDERS.some((p) => p.keyName === null);

export function keyNameOf(providerId: string): KeyName | null {
  return PROVIDERS.find((p) => p.id === providerId)?.keyName ?? null;
}
