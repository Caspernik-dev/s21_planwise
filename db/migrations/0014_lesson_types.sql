ALTER TABLE "rag_documents" ADD COLUMN "lesson_type" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "lesson_type" text DEFAULT 'rov' NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_scenarios" ADD COLUMN "lesson_type" text DEFAULT 'rov' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_lesson_type_check"
  CHECK ("lesson_type" IN ('rov','krujok','literacy','subject_extension','event'));--> statement-breakpoint
ALTER TABLE "shared_scenarios" ADD CONSTRAINT "shared_scenarios_lesson_type_check"
  CHECK ("lesson_type" IN ('rov','krujok','literacy','subject_extension','event'));--> statement-breakpoint
CREATE INDEX "shared_scenarios_lesson_type_idx" ON "shared_scenarios" ("lesson_type");