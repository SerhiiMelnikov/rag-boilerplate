import { registry } from "../registry";
import { z } from "../zod";
import { Settings, ErrorResponse } from "../schemas";

// Trimmed fixture mirroring src/lib/openapi/paths/admin-settings.ts: keeps the
// hardcoded provider arrays + per-provider *Key fields that
// pruneOpenApiProviderLists narrows, plus enough surrounding object literals
// (registerPath's responses/content nesting) to prove the object-literal loop
// doesn't touch unrelated property names.
const CHAT_PROVIDERS = ["google", "openai", "anthropic", "ollama"] as const;
const EMBEDDING_PROVIDERS = ["google", "openai", "ollama"] as const;

const SettingsUpdateRequest = registry.register("SettingsUpdateRequest", z.object({
  chatProvider: z.enum(CHAT_PROVIDERS),
  chatModel: z.string().min(1),
  embeddingProvider: z.enum(EMBEDDING_PROVIDERS),
  embeddingModel: z.string().min(1),
  // Keys: omit = leave, null = clear, string = set new plaintext (encrypted server-side).
  googleKey: z.string().min(1).nullable(),
  openaiKey: z.string().min(1).nullable(),
  anthropicKey: z.string().min(1).nullable(),
  smtpPassword: z.string().min(1).nullable(),
}).partial().openapi("SettingsUpdateRequest"));

registry.registerPath({
  method: "get",
  path: "/api/admin/settings",
  tags: ["Admin: Settings"],
  summary: "Get the current settings (provider keys masked)",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Current settings, with provider keys and the SMTP password masked to { set, last4 }",
      content: { "application/json": { schema: Settings } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/admin/settings",
  tags: ["Admin: Settings"],
  summary: "Update settings (partial; omit fields to leave them unchanged)",
  security: [{ sessionCookie: [] }],
  request: {
    body: { content: { "application/json": { schema: SettingsUpdateRequest } } },
  },
  responses: {
    200: {
      description: "Updated settings, provider keys masked",
      content: { "application/json": { schema: Settings } },
    },
    400: { description: "Invalid JSON or a value fails validation", content: { "application/json": { schema: ErrorResponse } } },
  },
});
