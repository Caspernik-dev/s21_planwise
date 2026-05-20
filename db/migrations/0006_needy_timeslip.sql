CREATE TABLE IF NOT EXISTS "likes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"opt_in_share" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "likes_user_scenario_uq" UNIQUE("user_id","scenario_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"source_scenario_id" text NOT NULL,
	"anonymized_content" jsonb NOT NULL,
	"direction" text NOT NULL,
	"grade" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"format" text NOT NULL,
	"topic" text NOT NULL,
	"embedding" vector(1024),
	"like_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_source_scenario_uq" UNIQUE("source_scenario_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "likes" ADD CONSTRAINT "likes_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_scenarios" ADD CONSTRAINT "shared_scenarios_source_scenario_id_scenarios_id_fk" FOREIGN KEY ("source_scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_direction_idx" ON "shared_scenarios" USING btree ("direction");