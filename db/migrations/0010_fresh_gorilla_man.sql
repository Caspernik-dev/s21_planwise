-- EmbeddingsGigaR теперь 2560-мерный (был 1024). HNSW на vector поддерживает <=2000 dims,
-- поэтому индекс убираем; на малом корпусе методичек точный KNN-поиск достаточно быстр.
DROP INDEX IF EXISTS "rag_chunks_embedding_hnsw";--> statement-breakpoint
ALTER TABLE "rag_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(2560);--> statement-breakpoint
ALTER TABLE "scenarios" ALTER COLUMN "embedding" SET DATA TYPE vector(2560);--> statement-breakpoint
ALTER TABLE "shared_scenarios" ALTER COLUMN "embedding" SET DATA TYPE vector(2560);