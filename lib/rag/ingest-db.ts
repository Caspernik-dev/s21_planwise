import { db } from '@/db'
import { ragChunks, ragDocuments } from '@/db/schema'
import { inArray, sql } from 'drizzle-orm'
import type { IngestDb } from './ingest'

export const drizzleIngestDb: IngestDb = {
  async existingHashesFor(hashes) {
    if (hashes.length === 0) return new Set()
    const rows = await db
      .select({ chunkHash: ragChunks.chunkHash })
      .from(ragChunks)
      .where(inArray(ragChunks.chunkHash, hashes))
    return new Set(rows.map((r) => r.chunkHash))
  },

  async upsertDocument(doc) {
    const [row] = await db
      .insert(ragDocuments)
      .values({
        source: doc.source,
        title: doc.title,
        direction: doc.direction,
        gradeRange: doc.gradeRange,
        rawUrl: doc.rawUrl,
      })
      .onConflictDoUpdate({
        target: ragDocuments.rawUrl,
        set: { title: doc.title, direction: doc.direction, gradeRange: doc.gradeRange },
      })
      .returning({ id: ragDocuments.id })
    return row.id
  },

  async insertChunk(chunk) {
    // vec строится из number[] (не пользовательский ввод) → безопасно интерполировать как ::vector литерал
    const vec = `[${chunk.embedding.join(',')}]`
    await db.execute(sql`
      INSERT INTO rag_chunks (id, document_id, chunk_text, chunk_hash, chunk_meta, embedding, tsv)
      VALUES (
        ${crypto.randomUUID()},
        ${chunk.documentId},
        ${chunk.chunkText},
        ${chunk.chunkHash},
        ${JSON.stringify(chunk.chunkMeta)}::jsonb,
        ${vec}::vector,
        to_tsvector(${chunk.lang}::regconfig, ${chunk.chunkText})
      )
      ON CONFLICT (chunk_hash) DO NOTHING
    `)
  },
}
