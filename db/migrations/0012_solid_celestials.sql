ALTER TABLE "scenarios" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_share_token_unique" UNIQUE("share_token");