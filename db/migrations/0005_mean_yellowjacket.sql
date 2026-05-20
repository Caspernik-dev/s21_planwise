CREATE TABLE IF NOT EXISTS "plan_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"work_plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"planned_date" text,
	"order_idx" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"original_filename" text,
	"raw_text" text NOT NULL,
	"anonymized" boolean DEFAULT true NOT NULL,
	"pii_found_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_topics" ADD CONSTRAINT "plan_topics_work_plan_id_work_plans_id_fk" FOREIGN KEY ("work_plan_id") REFERENCES "public"."work_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_topics" ADD CONSTRAINT "plan_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
