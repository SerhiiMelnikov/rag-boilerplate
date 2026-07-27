import { z } from "./zod";
import { registry } from "./registry";

// Trimmed fixture mirroring src/lib/openapi/schemas.ts. Includes an unrelated
// schema with a field literally named "google" that is NOT a KeyStatus — a
// regression guard proving pruneOpenApiProviderLists only removes
// provider-named properties whose initializer is the `keys` object's
// KeyStatus, not any property that merely shares a provider's name.
export const Locale = registry.register("Locale", z.object({
  google: z.string(), // unrelated field; must survive pruning
}).openapi("Locale"));

const KeyStatus = z.object({
  set: z.boolean(),
  last4: z.string().nullable(),
});

export const Settings = registry.register("Settings", z.object({
  chatProvider: z.string(),
  chatModel: z.string(),
  embeddingProvider: z.string(),
  embeddingModel: z.string(),
  keys: z.object({
    google: KeyStatus,
    openai: KeyStatus,
    anthropic: KeyStatus,
  }),
  smtpPassword: KeyStatus,
}).openapi("Settings"));
