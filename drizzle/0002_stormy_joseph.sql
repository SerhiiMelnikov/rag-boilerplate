ALTER TABLE "documents" DROP CONSTRAINT "documents_uploaded_by_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_filename_unique" UNIQUE("filename");