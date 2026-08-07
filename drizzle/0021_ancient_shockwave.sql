ALTER TABLE "settings" ADD COLUMN "speech_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "speech_model" text DEFAULT 'gemini-2.5-flash' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "transcribe_rate_limit_per_minute" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "transcribe_rate_limit_per_day" integer DEFAULT 100 NOT NULL;