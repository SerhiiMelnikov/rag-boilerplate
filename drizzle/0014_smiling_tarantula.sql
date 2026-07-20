ALTER TABLE "conversations" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "conversations" SET "workspace_id" = (SELECT "id" FROM "workspaces" WHERE "is_default" = true LIMIT 1) WHERE "workspace_id" IS NULL;
