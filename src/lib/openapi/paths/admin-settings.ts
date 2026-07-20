import { registry } from "../registry";
import { z } from "../zod";
import { Settings, ErrorResponse } from "../schemas";

// Request body for PUT /api/admin/settings. Mirrors settingsPatchSchema
// (src/lib/config/settings-service.ts) field-for-field: every field is optional (a
// partial update), and the four key/secret fields are tri-state — omitted = leave
// unchanged, null = clear, string = set a new plaintext value that the handler
// encrypts at rest. Defined inline here (not imported from settings-service.ts) to
// keep src/lib/openapi/ free of the module's DB-client dependency; keep this in sync
// with settingsPatchSchema if that schema changes.
const CHAT_PROVIDERS = ["google", "openai", "anthropic", "ollama"] as const;
const EMBEDDING_PROVIDERS = ["google", "openai", "ollama"] as const;

const SettingsUpdateRequest = registry.register("SettingsUpdateRequest", z.object({
  chatProvider: z.enum(CHAT_PROVIDERS),
  chatModel: z.string().min(1),
  embeddingProvider: z.enum(EMBEDDING_PROVIDERS),
  embeddingModel: z.string().min(1),
  parserProvider: z.enum(CHAT_PROVIDERS),
  parserModel: z.string().min(1),
  imageProvider: z.enum(CHAT_PROVIDERS),
  imageModel: z.string().min(1),
  unifiedMode: z.boolean(),
  unifiedProvider: z.enum(CHAT_PROVIDERS),
  unifiedModel: z.string().min(1),
  temperature: z.number().min(0).max(2),
  topK: z.number().int().min(1).max(50),
  minSimilarity: z.number().min(0).max(1),
  contextTokenBudget: z.number().int().min(100).max(100000),
  systemPrompt: z.string().min(1),
  ollamaBaseUrl: z.string().url(),
  chatRateLimitPerMinute: z.number().int().min(0).max(100000),
  chatRateLimitPerDay: z.number().int().min(0).max(1000000),
  allowedEmailDomains: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string(),
  smtpFrom: z.string(),
  // Keys: omit = leave, null = clear, string = set new plaintext (encrypted server-side).
  googleKey: z.string().min(1).nullable(),
  openaiKey: z.string().min(1).nullable(),
  anthropicKey: z.string().min(1).nullable(),
  smtpPassword: z.string().min(1).nullable(),
}).partial().openapi("SettingsUpdateRequest"));

// GET /api/admin/settings (src/app/api/admin/settings/route.ts: getAdminSettings()):
// returns the masked AdminSettings shape directly (not wrapped) — provider API keys and
// the SMTP password are never returned in plaintext, only a { set, last4 } KeyStatus.
// AdminSettings matches the registered Settings schema field-for-field, so it is reused
// as-is rather than declared inline.
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

// PUT /api/admin/settings (.../route.ts) — corrected against the handler: the success
// response is NOT `200 {ok}` as the brief's table listed. `updateSettings()` returns
// `getAdminSettings()`'s masked snapshot (the same shape as GET), so the caller sees its
// own change reflected immediately, keys still masked.
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
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});
