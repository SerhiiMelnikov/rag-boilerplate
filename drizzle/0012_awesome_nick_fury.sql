ALTER TABLE "settings" ADD COLUMN "chat_rate_limit_per_minute" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "chat_rate_limit_per_day" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "register_rate_limit_per_hour" integer DEFAULT 5 NOT NULL;