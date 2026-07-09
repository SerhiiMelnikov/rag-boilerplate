CREATE TABLE IF NOT EXISTS "document_workspaces" (
	"document_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "document_workspaces_document_id_workspace_id_pk" PRIMARY KEY("document_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_workspaces" (
	"image_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "image_workspaces_image_id_workspace_id_pk" PRIMARY KEY("image_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_workspaces" (
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "user_workspaces_user_id_workspace_id_pk" PRIMARY KEY("user_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_workspaces" ADD CONSTRAINT "document_workspaces_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_workspaces" ADD CONSTRAINT "document_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "image_workspaces" ADD CONSTRAINT "image_workspaces_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "image_workspaces" ADD CONSTRAINT "image_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Seed the default General workspace (idempotent).
INSERT INTO "workspaces" ("name", "is_default") VALUES ('General', true) ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Backfill: every existing document/image becomes a member of General so that
-- workspace scoping (wired in Phase B) never hides pre-existing content.
INSERT INTO "document_workspaces" ("document_id", "workspace_id")
  SELECT d."id", w."id" FROM "documents" d CROSS JOIN "workspaces" w WHERE w."is_default" = true
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "image_workspaces" ("image_id", "workspace_id")
  SELECT i."id", w."id" FROM "images" i CROSS JOIN "workspaces" w WHERE w."is_default" = true
  ON CONFLICT DO NOTHING;
