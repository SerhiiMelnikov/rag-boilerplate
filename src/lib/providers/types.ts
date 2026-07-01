export type ProviderId = "google" | "openai" | "anthropic" | "ollama";
export type EmbeddingProviderId = "google" | "openai" | "ollama";
export type EmbeddingKind = "document" | "query";

// Thrown by the factory when a selected provider has no configured API key.
export class MissingProviderKeyError extends Error {
  constructor(public task: string, public provider: string) {
    super(`${task} is not configured: no API key for provider "${provider}". Add it in Admin → Provider keys.`);
    this.name = "MissingProviderKeyError";
  }
}

// Thrown (via toProviderError) when a provider rejects the key at call time.
export class InvalidProviderKeyError extends Error {
  constructor(public task: string, public provider: string) {
    super(`${task} failed: the API key for provider "${provider}" is invalid or unauthorized. Check it in Admin → Provider keys.`);
    this.name = "InvalidProviderKeyError";
  }
}

export function isProviderError(err: unknown): boolean {
  return err instanceof MissingProviderKeyError || err instanceof InvalidProviderKeyError;
}

// Detect provider auth failures (401/403) from thrown AI SDK errors, which may
// expose statusCode or embed the code in the message.
export function isAuthError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { statusCode?: number; status?: number }).statusCode ?? (err as { status?: number }).status;
    if (code === 401 || code === 403) return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b401\b|\b403\b|unauthorized|forbidden|invalid api key|invalid_api_key/i.test(msg);
}

// Map an auth failure to InvalidProviderKeyError; leave all other errors intact.
export function toProviderError(err: unknown, task: string, provider: string): unknown {
  return isAuthError(err) ? new InvalidProviderKeyError(task, provider) : err;
}
