CREATE TYPE "public"."eval_run_status" AS ENUM('pending', 'running', 'done', 'error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"expected_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_answer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" uuid,
	"question_text" text NOT NULL,
	"retrieved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hit" boolean DEFAULT false NOT NULL,
	"recall" real DEFAULT 0 NOT NULL,
	"precision" real DEFAULT 0 NOT NULL,
	"mrr" real DEFAULT 0 NOT NULL,
	"judge_score" integer,
	"judge_rationale" text,
	"generated_answer" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "eval_run_status" DEFAULT 'pending' NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"aggregate" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_question_id_eval_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."eval_questions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
