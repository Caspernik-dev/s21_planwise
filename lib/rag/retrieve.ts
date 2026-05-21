import { db } from '@/db'
import { embed as gigaEmbed } from '@/lib/gigachat/embeddings'
import { SPO_GRADE } from '@/lib/scenario/options'
import { sql } from 'drizzle-orm'
import { type Candidate, rankAndDiversify } from './score'

export type RetrieveQuery = {
  direction: string | null
  grade: number
  topic: string
  lang?: string
}

export type RetrievedChunk = {
  id: string
  documentId: string
  chunkText: string
  documentTitle: string
  sectionKind: string
  score: number
}

type CandidateRow = Candidate & {
  chunkText: string
  chunkMeta: { document_title?: string; section_kind?: string }
}

type QueryArgs = {
  qvec: number[]
  grade: number
  topic: string
  lang: string
  direction: string | null
  limit: number
}

export type RetrieveDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  queryCandidates: (args: QueryArgs) => Promise<CandidateRow[]>
  topK: number
  maxPerDoc: number
  candidates: number
}

async function queryCandidatesLive(args: QueryArgs): Promise<CandidateRow[]> {
  const vec = `[${args.qvec.join(',')}]`
  const dirFilter = args.direction ? sql`AND chunk_meta->>'direction' = ${args.direction}` : sql``
  const rows = await db.execute(sql`
    SELECT
      id,
      document_id AS "documentId",
      chunk_text AS "chunkText",
      chunk_meta AS "chunkMeta",
      (1 - (embedding <=> ${vec}::vector)) AS cosine,
      ts_rank(tsv, plainto_tsquery(${args.lang}::regconfig, ${args.topic})) AS bm25
    FROM rag_chunks
    WHERE (chunk_meta->>'grade_min')::int <= ${args.grade}
      AND (chunk_meta->>'grade_max')::int >= ${args.grade}
      ${dirFilter}
    ORDER BY (embedding <=> ${vec}::vector) ASC
    LIMIT ${args.limit}
  `)
  return rows as unknown as CandidateRow[]
}

function defaults(): RetrieveDeps {
  return {
    embed: gigaEmbed,
    queryCandidates: queryCandidatesLive,
    topK: Number(process.env.RAG_TOP_K ?? '3'),
    maxPerDoc: Number(process.env.RAG_MAX_PER_DOC ?? '2'),
    candidates: Number(process.env.RAG_CANDIDATES ?? '24'),
  }
}

export async function retrieveChunks(
  query: RetrieveQuery,
  deps: Partial<RetrieveDeps> = {},
): Promise<RetrievedChunk[]> {
  const d = { ...defaults(), ...deps }
  const lang = query.lang ?? process.env.PG_TSV_LANG ?? 'russian'
  const [qvec] = await d.embed([`${query.direction ?? ''} ${query.topic}`.trim()])
  if (!qvec) throw new Error('retrieveChunks: embed returned no query vector')

  const base: Omit<QueryArgs, 'direction'> = {
    qvec,
    grade: query.grade === SPO_GRADE ? 11 : query.grade,
    topic: query.topic,
    lang,
    limit: d.candidates,
  }

  let rows = await d.queryCandidates({ ...base, direction: query.direction })
  if (rows.length < d.topK && query.direction) {
    rows = await d.queryCandidates({ ...base, direction: null })
  }

  const ranked = rankAndDiversify(
    rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      cosine: Number(r.cosine),
      bm25: Number(r.bm25),
    })),
    { topK: d.topK, maxPerDoc: d.maxPerDoc },
  )

  const byId = new Map(rows.map((r) => [r.id, r]))
  return ranked.map((r) => {
    const src = byId.get(r.id) as CandidateRow
    return {
      id: r.id,
      documentId: r.documentId,
      chunkText: src.chunkText,
      documentTitle: src.chunkMeta?.document_title ?? '',
      sectionKind: src.chunkMeta?.section_kind ?? 'other',
      score: r.score,
    }
  })
}
