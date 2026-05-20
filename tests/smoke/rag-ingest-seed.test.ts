import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

const live = process.env.RAG_LIVE === '1'

describe.skipIf(!live)('seed corpus ingested (live)', () => {
  it('has seed documents', async () => {
    const r = await db.execute(
      sql`SELECT count(*)::int AS n FROM rag_documents WHERE source='seed'`,
    )
    expect((r[0] as { n: number }).n).toBeGreaterThanOrEqual(12)
  })
  it('has chunks with non-null embedding and tsv', async () => {
    const r = await db.execute(
      sql`SELECT count(*)::int AS n FROM rag_chunks WHERE embedding IS NOT NULL AND tsv IS NOT NULL`,
    )
    expect((r[0] as { n: number }).n).toBeGreaterThan(0)
  })
})
