import { chunkStructured } from './chunk'
import { chunkHash } from './hash'

export type IngestDoc = {
  source: string
  title: string
  direction: string | null
  gradeRange: string | null
  gradeMin: number
  gradeMax: number
  rawUrl: string
  text: string
  lang: string
}

export type IngestDb = {
  existingHashesFor(hashes: string[]): Promise<Set<string>>
  upsertDocument(doc: {
    source: string
    title: string
    direction: string | null
    gradeRange: string | null
    rawUrl: string
  }): Promise<string>
  insertChunk(chunk: {
    documentId: string
    chunkText: string
    chunkHash: string
    chunkMeta: Record<string, unknown>
    embedding: number[]
    lang: string
  }): Promise<void>
}

export type IngestDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  db: IngestDb
}

export async function ingestDocument(
  doc: IngestDoc,
  deps: IngestDeps,
): Promise<{ inserted: number; skipped: number }> {
  const chunks = chunkStructured(doc.text)
  if (chunks.length === 0) return { inserted: 0, skipped: 0 }

  const withHash = chunks.map((c) => ({ ...c, hash: chunkHash(c.text) }))

  // Deduplicate by hash within this batch
  const seen = new Set<string>()
  const unique = withHash.filter((c) => {
    if (seen.has(c.hash)) return false
    seen.add(c.hash)
    return true
  })

  const existing = await deps.db.existingHashesFor(unique.map((c) => c.hash))
  const toInsert = unique.filter((c) => !existing.has(c.hash))
  const skipped = unique.length - toInsert.length

  if (toInsert.length === 0) return { inserted: 0, skipped }

  const documentId = await deps.db.upsertDocument({
    source: doc.source,
    title: doc.title,
    direction: doc.direction,
    gradeRange: doc.gradeRange,
    rawUrl: doc.rawUrl,
  })

  const embeddings = await deps.embed(toInsert.map((c) => c.text))

  for (let i = 0; i < toInsert.length; i++) {
    const c = toInsert[i]
    await deps.db.insertChunk({
      documentId,
      chunkText: c.text,
      chunkHash: c.hash,
      chunkMeta: {
        source: doc.source,
        document_title: doc.title,
        direction: doc.direction,
        grade_min: doc.gradeMin,
        grade_max: doc.gradeMax,
        section_kind: c.sectionKind,
        ...(c.stageIdx !== undefined ? { stage_idx: c.stageIdx } : {}),
      },
      embedding: embeddings[i],
      lang: doc.lang,
    })
  }

  return { inserted: toInsert.length, skipped }
}
