ALTER TABLE "settings" ADD COLUMN "image_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "image_model" text DEFAULT 'gemini-2.5-flash' NOT NULL;