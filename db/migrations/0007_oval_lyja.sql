CREATE TABLE IF NOT EXISTS "rate_buckets" (
	"key" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_buckets_key_subject_window_start_pk" PRIMARY KEY("key","subject","window_start")
);
