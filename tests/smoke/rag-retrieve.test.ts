import { retrieveChunks } from '@/lib/rag/retrieve'
import { describe, expect, it } from 'vitest'

const live = process.env.RAG_LIVE === '1'

describe.skipIf(!live)('live retrieval over seed corpus', () => {
  it('returns up to RAG_TOP_K chunks for a seeded topic', async () => {
    const out = await retrieveChunks({
      direction: 'Гражданское',
      grade: 6,
      topic: 'волонтёрство и помощь другим',
      lang: process.env.PG_TSV_LANG ?? 'russian',
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThanOrEqual(Number(process.env.RAG_TOP_K ?? '3'))
    expect(out[0].chunkText.length).toBeGreaterThan(0)
  }, 30000)
})
