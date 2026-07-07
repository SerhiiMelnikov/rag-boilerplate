CREATE TABLE IF NOT EXISTS "image_vectors" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"status" "doc_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "images_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "image_vectors" ADD CONSTRAINT "image_vectors_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "images" ADD CONSTRAINT "images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
