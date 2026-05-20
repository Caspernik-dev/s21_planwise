CREATE TABLE IF NOT EXISTS "rag_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"chunk_text" text NOT NULL,
	"chunk_hash" text NOT NULL,
	"chunk_meta" jsonb NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"tsv" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rag_chunks_chunk_hash_unique" UNIQUE("chunk_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rag_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"grade_range" text,
	"direction" text,
	"raw_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rag_documents_raw_url_unique" UNIQUE("raw_url")
);
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "embedding" vector(1024);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
