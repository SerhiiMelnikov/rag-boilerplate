import {
  pgTable, uuid, text, timestamp, integer, jsonb, vector, real, pgEnum, boolean, primaryKey,
} from "drizzle-orm/pg-core";

// Embedding dimension is fixed to the embedding model. We use gemini-embedding-2
// with outputDimensionality=768 (it defaults to 3072 but supports reduction),
// which keeps vectors compact and within pgvector's ANN index limit.
// Changing the embedding model/dimension requires re-indexing all chunks.
export const EMBEDDING_DIMENSIONS = 768;

export const roleEnum = pgEnum("role", ["admin", "user"]);
export const docStatusEnum = pgEnum("doc_status", ["pending", "processing", "ready", "error"]);
export const msgRoleEnum = pgEnum("msg_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  blockedAt: timestamp("blocked_at"),
  // Null until the address is confirmed. In `open` registration mode nothing ever
  // sets this and the login gate that reads it is pruned out — see the CLI task.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull().unique(),
  status: docStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  contentHash: text("content_hash").notNull(),
});

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  caption: text("caption").notNull().default(""),
  status: docStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// pgvector-only: image caption embeddings live here ONLY when VECTOR_STORE=pgvector
// (other stores keep image vectors in their own backend). Mirrors `chunks`.
export const imageVectors = pgTable("image_vectors", {
  imageId: uuid("image_id").primaryKey().references(() => images.id, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: msgRoleEnum("role").notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources").$type<Array<{ documentId: string; filename: string; chunkId: string; score: number }>>().notNull().default([]),
  images: jsonb("images").$type<Array<{ imageId: string; filename: string; score: number }>>().notNull().default([]),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  rating: integer("rating"), // 1 | -1 | null
  usage: jsonb("usage").$type<{ promptTokens: number; completionTokens: number } | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1), // singleton row
  // Per-task provider + model (provider is text + zod-validated, not a pg enum,
  // so new providers need no migration).
  chatProvider: text("chat_provider").notNull().default("google"),
  chatModel: text("chat_model").notNull().default("gemma-4-31b-it"),
  embeddingProvider: text("embedding_provider").notNull().default("google"),
  embeddingModel: text("embedding_model").notNull().default("gemini-embedding-2"),
  parserProvider: text("parser_provider").notNull().default("google"),
  parserModel: text("parser_model").notNull().default("gemini-2.5-flash"),
  imageProvider: text("image_provider").notNull().default("google"),
  imageModel: text("image_model").notNull().default("gemini-2.5-flash"),
  // When on, chat/parser/image all use unifiedProvider/unifiedModel instead of
  // their individual columns above (embedding is never affected).
  unifiedMode: boolean("unified_mode").notNull().default(false),
  unifiedProvider: text("unified_provider").notNull().default("google"),
  unifiedModel: text("unified_model").notNull().default("gemma-4-31b-it"),
  // Behavior (sampling = temperature only).
  temperature: real("temperature").notNull().default(0.2),
  topK: integer("top_k").notNull().default(5), // retrieval chunk count
  minSimilarity: real("min_similarity").notNull().default(0.3),
  contextTokenBudget: integer("context_token_budget").notNull().default(3000),
  systemPrompt: text("system_prompt").notNull().default("You are a helpful assistant. Answer using only the provided context."),
  // Rate limits. 0 disables the rule. Defaults are deliberately generous enough
  // for a real person and far too tight for a script.
  chatRateLimitPerMinute: integer("chat_rate_limit_per_minute").notNull().default(20),
  chatRateLimitPerDay: integer("chat_rate_limit_per_day").notNull().default(200),
  // Registration. `open` = anyone may register; `verified` = the address must be at
  // an allowed domain AND confirmed by clicking an emailed link.
  registrationMode: text("registration_mode").notNull().default("verified"),
  // Comma-separated, lowercase. EMPTY MEANS NOBODY: an empty list denies every
  // registration. seed:admin seeds it from ADMIN_EMAIL's domain so a fresh install
  // is not a dead end.
  allowedEmailDomains: text("allowed_email_domains").notNull().default(""),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpFrom: text("smtp_from").notNull().default(""),
  // Encrypted at rest, like the provider API keys. Never returned in plaintext.
  smtpPassword: text("smtp_password"),
  // Provider API keys, encrypted at rest (nullable until an admin sets them).
  googleKey: text("google_key"),
  openaiKey: text("openai_key"),
  anthropicKey: text("anthropic_key"),
  ollamaBaseUrl: text("ollama_base_url").notNull().default("http://localhost:11434"),
});

// Workspaces group documents/images and gate retrieval. "General" (is_default)
// is seeded once, is undeletable, and is implicitly visible to every user.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// M:N document <-> workspace membership. Membership lives ONLY here (Postgres),
// so moving a document between workspaces never rewrites vectors.
export const documentWorkspaces = pgTable("document_workspaces", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.documentId, t.workspaceId] }) }));

// M:N image <-> workspace membership.
export const imageWorkspaces = pgTable("image_workspaces", {
  imageId: uuid("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.imageId, t.workspaceId] }) }));

// M:N user <-> workspace access grant. General access is implicit (no rows).
export const userWorkspaces = pgTable("user_workspaces", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.workspaceId] }) }));

// Fixed-window rate-limit counters. `key` identifies the subject and the rule
// (e.g. "chat:minute:user:<id>"), `window_start` is the clock floored to the
// window, so a row is one (subject, rule, window) bucket. Rows are disposable:
// they are pruned once they fall out of the longest window.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.key, t.windowStart] }) }),
);

// Single-use, short-lived proof that someone controls an email address. Stored raw:
// the token grants exactly one state change on one row, so hashing costs more than
// it buys. Cascade so deleting a user cannot orphan tokens.
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
