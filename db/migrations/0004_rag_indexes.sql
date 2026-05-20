CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS rag_chunks_tsv_gin
  ON rag_chunks USING gin (tsv);

CREATE INDEX IF NOT EXISTS rag_chunks_grade_idx
  ON rag_chunks (((chunk_meta->>'grade_min')::int), ((chunk_meta->>'grade_max')::int));
