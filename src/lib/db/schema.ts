import {
  pgTable, uuid, text, timestamp, integer, jsonb, vector, real, pgEnum,
} from "drizzle-orm/pg-core";

// Embedding dimension is fixed to the embedding model (Gemini text-embedding-004).
// Changing the provider/model requires re-indexing all chunks.
export const EMBEDDING_DIMENSIONS = 768;

export const roleEnum = pgEnum("role", ["admin", "user"]);
export const docStatusEnum = pgEnum("doc_status", ["pending", "processing", "ready", "error"]);
export const msgRoleEnum = pgEnum("msg_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  status: docStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
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
  rating: integer("rating"), // 1 | -1 | null
  usage: jsonb("usage").$type<{ promptTokens: number; completionTokens: number } | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1), // singleton row
  topK: integer("top_k").notNull().default(5),
  model: text("model").notNull().default("gemini-1.5-flash"),
  temperature: real("temperature").notNull().default(0.2),
  systemPrompt: text("system_prompt").notNull().default("You are a helpful assistant. Answer using only the provided context."),
  minSimilarity: real("min_similarity").notNull().default(0.3),
  contextTokenBudget: integer("context_token_budget").notNull().default(3000),
});
