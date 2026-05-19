import { describe, expect, it } from 'vitest'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

describe('smoke', () => {
  it('connects to the database', async () => {
    const result = await db.execute(sql`SELECT 1 as ok`)
    expect(result.length).toBeGreaterThan(0)
    expect((result[0] as { ok: number }).ok).toBe(1)
  })

  it('pgvector extension is available', async () => {
    const result = await db.execute(
      sql`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS has_vector`,
    )
    expect((result[0] as { has_vector: boolean }).has_vector).toBe(true)
  })
})
