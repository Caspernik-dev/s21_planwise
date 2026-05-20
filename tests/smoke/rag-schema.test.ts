import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('rag schema', () => {
  it('rag_documents and rag_chunks exist', async () => {
    const r = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('rag_documents','rag_chunks')`,
    )
    expect(r.length).toBe(2)
  })

  it('rag_chunks.embedding is a vector column', async () => {
    const r = await db.execute(
      sql`SELECT udt_name FROM information_schema.columns WHERE table_name='rag_chunks' AND column_name='embedding'`,
    )
    expect((r[0] as { udt_name: string }).udt_name).toBe('vector')
  })

  it('scenarios.embedding column exists', async () => {
    const r = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='scenarios' AND column_name='embedding'`,
    )
    expect(r.length).toBe(1)
  })
})
