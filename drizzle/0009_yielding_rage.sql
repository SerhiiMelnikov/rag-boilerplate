ALTER TABLE "settings" ADD COLUMN "unified_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "unified_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "unified_model" text DEFAULT 'gemma-4-31b-it' NOT NULL;