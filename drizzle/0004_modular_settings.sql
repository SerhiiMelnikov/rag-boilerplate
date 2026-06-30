ALTER TABLE "settings" RENAME COLUMN "model" TO "chat_model";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "chat_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "embedding_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "embedding_model" text DEFAULT 'gemini-embedding-2' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parser_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parser_model" text DEFAULT 'gemini-2.5-flash' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "google_key" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "openai_key" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "anthropic_key" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ollama_base_url" text DEFAULT 'http://localhost:11434' NOT NULL;
