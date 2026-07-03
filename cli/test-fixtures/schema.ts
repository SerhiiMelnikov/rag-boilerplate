import { pgTable, text } from "drizzle-orm/pg-core";
export const settings = pgTable("settings", {
  chatProvider: text("chat_provider").notNull().default("google"),
  chatModel: text("chat_model").notNull().default("gemma-4-31b-it"),
  embeddingProvider: text("embedding_provider").notNull().default("google"),
  embeddingModel: text("embedding_model").notNull().default("gemini-embedding-2"),
  parserProvider: text("parser_provider").notNull().default("google"),
  parserModel: text("parser_model").notNull().default("gemini-2.5-flash"),
});
