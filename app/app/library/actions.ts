'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { filterByThreshold } from '@/lib/community/prematch'
import { embed } from '@/lib/gigachat/embeddings'
import { checkRateLimit } from '@/lib/ratelimit'
import { sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export type LibraryCard = {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: Array<{ title: string }>
}

function toCard(r: Record<string, unknown>): LibraryCard {
  const content = r.content as { stages?: Array<{ title: string }> }
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    direction: String(r.direction),
    format: String(r.format),
    likeCount: Number(r.likeCount),
    stages: (content.stages ?? []).map((s) => ({ title: s.title })),
  }
}

export async function searchSharedAction(query: string): Promise<LibraryCard[]> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const rlS = await checkRateLimit({
    key: 'search',
    subject: session.user.id,
    email: session.user.email,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rlS.allowed) return []

  const q = query.trim()

  if (q.length === 0) {
    const rows = await db.execute(sql`
      SELECT id, like_count AS "likeCount", direction, format,
        anonymized_content AS "content", anonymized_content->>'title' AS title
      FROM shared_scenarios
      ORDER BY like_count DESC, created_at DESC
      LIMIT 24
    `)
    return (rows as unknown as Array<Record<string, unknown>>).map(toCard)
  }

  let qvec: number[] | null = null
  try {
    const [v] = await embed([q])
    qvec = v ?? null
  } catch (e) {
    console.error('library embed failed:', e)
  }
  if (!qvec) return []
  const vec = `[${qvec.join(',')}]`
  const rows = await db.execute(sql`
    SELECT id, like_count AS "likeCount", direction, format,
      anonymized_content AS "content", anonymized_content->>'title' AS title,
      (1 - (embedding <=> ${vec}::vector)) AS similarity
    FROM shared_scenarios
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT 24
  `)
  const mapped = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    ...toCard(r),
    similarity: Number(r.similarity),
  }))
  const threshold = Number(process.env.LIBRARY_SIMILARITY_THRESHOLD ?? '0.5')
  return filterByThreshold(mapped, threshold, 24)
}
