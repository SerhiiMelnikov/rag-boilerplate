ALTER TABLE "documents" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "documents_dirs" text DEFAULT '' NOT NULL;