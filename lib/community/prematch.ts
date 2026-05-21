import { db } from '@/db'
import { embed as gigaEmbed } from '@/lib/gigachat/embeddings'
import { SPO_GRADE } from '@/lib/scenario/options'
import { sql } from 'drizzle-orm'

export type PrematchQuery = {
  direction: string
  grade: number
  topic: string
  format: string
}

export type SharedMatch = {
  id: string
  title: string
  direction: string
  grade: number
  format: string
  topic: string
  likeCount: number
  anonymizedContent: unknown
  similarity: number
}

export function filterByThreshold<T extends { similarity: number }>(
  rows: T[],
  threshold: number,
  topK: number,
): T[] {
  return rows
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

export type PrematchDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  queryRows: (qvec: number[], q: PrematchQuery, gradeSpan: number) => Promise<SharedMatch[]>
  threshold: number
  topK: number
  gradeSpan: number
}

async function queryRowsLive(
  qvec: number[],
  q: PrematchQuery,
  gradeSpan: number,
): Promise<SharedMatch[]> {
  const vec = `[${qvec.join(',')}]`
  const gradeClause =
    q.grade === SPO_GRADE
      ? sql`grade = ${SPO_GRADE}`
      : sql`grade BETWEEN ${q.grade - gradeSpan} AND ${q.grade + gradeSpan}`
  const rows = await db.execute(sql`
    SELECT id, direction, grade, format, topic, like_count AS "likeCount",
      anonymized_content AS "anonymizedContent",
      anonymized_content->>'title' AS title,
      (1 - (embedding <=> ${vec}::vector)) AS similarity
    FROM shared_scenarios
    WHERE direction = ${q.direction}
      AND format = ${q.format}
      AND ${gradeClause}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT 20
  `)
  return (rows as unknown as SharedMatch[]).map((r) => ({ ...r, similarity: Number(r.similarity) }))
}

function defaults(): PrematchDeps {
  return {
    embed: gigaEmbed,
    queryRows: queryRowsLive,
    threshold: Number(process.env.SIMILARITY_THRESHOLD ?? '0.78'),
    topK: 3,
    gradeSpan: 2,
  }
}

export async function prematchShared(
  q: PrematchQuery,
  deps: Partial<PrematchDeps> = {},
): Promise<SharedMatch[]> {
  const d = { ...defaults(), ...deps }
  const [qvec] = await d.embed([`${q.direction} ${q.grade} ${q.topic} ${q.format}`.trim()])
  if (!qvec) return []
  const rows = await d.queryRows(qvec, q, d.gradeSpan)
  return filterByThreshold(rows, d.threshold, d.topK)
}
