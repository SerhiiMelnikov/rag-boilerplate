import { z } from "./zod";
import { registry } from "./registry";
import { registerSchema, setPasswordSchema } from "@/lib/validation";

// Generic error envelope used across the API.
export const ErrorResponse = registry.register("ErrorResponse", z.object({
  error: z.string(),
}).openapi("ErrorResponse"));

// ---- Chat / conversations (src/lib/chat/conversations.ts) ----

// Mirrors SourceRef.
export const SourceRef = registry.register("SourceRef", z.object({
  documentId: z.string().uuid(),
  filename: z.string(),
  chunkId: z.string(),
  score: z.number(),
}).openapi("SourceRef"));

// Mirrors ImageResultRef.
export const ImageResult = registry.register("ImageResult", z.object({
  imageId: z.string().uuid(),
  caption: z.string(),
}).openapi("ImageResult"));

// Matches the { id, title, createdAt } projection returned by listConversations().
export const Conversation = registry.register("Conversation", z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string().datetime(),
}).openapi("Conversation"));

// Mirrors MessageRecord. Note: unlike `addMessage()`'s input, the read path
// (getConversationWithMessages) never selects the `sources` column, so a returned
// message carries no `sources` field.
export const Message = registry.register("Message", z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  images: z.array(ImageResult),
  rating: z.number().nullable(),
  usage: z.object({ promptTokens: z.number(), completionTokens: z.number() }).nullable(),
  createdAt: z.string().datetime(),
}).openapi("Message"));

// ---- Workspaces ----
// The same { id, name, isDefault } shape is used for both the user-facing
// VisibleWorkspace (src/lib/workspaces/visible.ts) and FileWorkspace
// (src/lib/workspaces/membership.ts) projections.
export const Workspace = registry.register("Workspace", z.object({
  id: z.string().uuid(),
  name: z.string(),
  isDefault: z.boolean(),
}).openapi("Workspace"));

// ---- Users (src/lib/auth/user-admin.ts: listUsers) ----
export const User = registry.register("User", z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  isSuperAdmin: z.boolean(),
  blockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).openapi("User"));

// ---- Documents (src/lib/documents/service.ts: listDocuments) ----
export const Document = registry.register("Document", z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: z.enum(["pending", "processing", "ready", "error"]),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi("Document"));

// ---- Files (src/lib/files/service.ts: FileRow) ----
// Read-time union of documents + images for the admin file list.
export const FileRow = registry.register("FileRow", z.object({
  id: z.string().uuid(),
  kind: z.enum(["document", "image"]),
  filename: z.string(),
  ext: z.string(),
  status: z.enum(["pending", "processing", "ready", "error"]),
  error: z.string().nullable(),
  caption: z.string().nullable(), // images only; null for documents
  workspaces: z.array(Workspace), // empty = unassigned (excluded from retrieval)
  createdAt: z.string().datetime(),
}).openapi("FileRow"));

// ---- Settings (src/lib/config/settings-service.ts: AdminSettings) ----
// Masked: provider API keys and the SMTP password are never returned in plaintext,
// only a { set, last4 } status (KeyStatus).
const KeyStatus = z.object({
  set: z.boolean(),
  last4: z.string().nullable(),
});

export const Settings = registry.register("Settings", z.object({
  chatProvider: z.string(),
  chatModel: z.string(),
  embeddingProvider: z.string(),
  embeddingModel: z.string(),
  parserProvider: z.string(),
  parserModel: z.string(),
  imageProvider: z.string(),
  imageModel: z.string(),
  unifiedMode: z.boolean(),
  unifiedProvider: z.string(),
  unifiedModel: z.string(),
  temperature: z.number(),
  topK: z.number(),
  minSimilarity: z.number(),
  contextTokenBudget: z.number(),
  systemPrompt: z.string(),
  ollamaBaseUrl: z.string(),
  chatRateLimitPerMinute: z.number(),
  chatRateLimitPerDay: z.number(),
  allowedEmailDomains: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpUser: z.string(),
  smtpFrom: z.string(),
  keys: z.object({
    google: KeyStatus,
    openai: KeyStatus,
    anthropic: KeyStatus,
  }),
  smtpPassword: KeyStatus,
}).openapi("Settings"));

// ---- Evaluation (src/lib/eval/repo.ts: QuestionRow / RunRow / ResultRow) ----
export const EvalQuestion = registry.register("EvalQuestion", z.object({
  id: z.string().uuid(),
  question: z.string(),
  expectedDocumentIds: z.array(z.string().uuid()),
  referenceAnswer: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi("EvalQuestion"));

// Mirrors EvalSettingsSnapshot (src/lib/eval/types.ts), embedded in EvalRun.
const EvalSettingsSnapshot = z.object({
  topK: z.number(),
  minSimilarity: z.number(),
  contextTokenBudget: z.number(),
  chatProvider: z.string(),
  chatModel: z.string(),
  embeddingProvider: z.string(),
  embeddingModel: z.string(),
  temperature: z.number(),
  systemPrompt: z.string(),
});

// Mirrors EvalAggregate (src/lib/eval/types.ts), embedded in EvalRun.
const EvalAggregate = z.object({
  avgRecall: z.number(),
  avgPrecision: z.number(),
  avgMrr: z.number(),
  avgJudgeScore: z.number(),
  passRate: z.number(),
  questionCount: z.number(),
});

export const EvalRun = registry.register("EvalRun", z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "running", "done", "error"]),
  settingsSnapshot: EvalSettingsSnapshot,
  aggregate: EvalAggregate.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi("EvalRun"));

// Mirrors RetrievedDoc (src/lib/eval/types.ts), embedded in EvalResult.
const RetrievedDoc = z.object({
  documentId: z.string().uuid(),
  filename: z.string(),
  score: z.number(),
});

// Note: unlike EvalQuestion/EvalRun, ResultRow has no createdAt column.
export const EvalResult = registry.register("EvalResult", z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid().nullable(),
  questionText: z.string(),
  retrieved: z.array(RetrievedDoc),
  hit: z.boolean(),
  recall: z.number(),
  precision: z.number(),
  mrr: z.number(),
  judgeScore: z.number().nullable(),
  judgeRationale: z.string().nullable(),
  generatedAnswer: z.string().nullable(),
  error: z.string().nullable(),
}).openapi("EvalResult"));

// ---- Request bodies that already exist as zod schemas in src/lib/validation.ts ----
// `.openapi(name)` on an already-created schema only attaches a ref name; it does not
// mutate validation.ts's exported behaviour. Exported so path modules can reference the
// exact registered instance (POST /api/register, POST /api/auth/verify).
export const RegisterRequest = registry.register("RegisterRequest", registerSchema.openapi("RegisterRequest"));
export const SetPasswordRequest = registry.register("SetPasswordRequest", setPasswordSchema.openapi("SetPasswordRequest"));
