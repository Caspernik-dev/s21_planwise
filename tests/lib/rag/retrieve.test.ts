import { retrieveChunks } from '@/lib/rag/retrieve'
import { describe, expect, it, vi } from 'vitest'

const row = (id: string, documentId: string, cosine: number, bm25: number) => ({
  id,
  documentId,
  chunkText: `text-${id}`,
  chunkMeta: { document_title: 'Doc', section_kind: 'stage' },
  cosine,
  bm25,
})

describe('retrieveChunks', () => {
  it('embeds the query once and returns topK diversified chunks', async () => {
    const embed = vi.fn(async () => [[0.1]])
    const queryCandidates = vi.fn(async () => [
      row('1', 'A', 0.9, 5),
      row('2', 'A', 0.8, 4),
      row('3', 'A', 0.7, 3),
      row('4', 'B', 0.6, 2),
    ])
    const out = await retrieveChunks(
      { direction: 'Гражданское', grade: 6, topic: 'дружба', lang: 'russian' },
      { embed, queryCandidates, topK: 3, maxPerDoc: 2, candidates: 24 },
    )
    expect(embed).toHaveBeenCalledTimes(1)
    expect(out.map((c) => c.id)).toEqual(['1', '2', '4'])
    expect(out[0].chunkText).toBe('text-1')
  })

  it('falls back to no-direction query when filtered result is smaller than topK', async () => {
    const embed = vi.fn(async () => [[0.1]])
    const queryCandidates = vi.fn(async (args: { direction: string | null }) => {
      if (args.direction) return [row('1', 'A', 0.9, 5)]
      return [row('1', 'A', 0.9, 5), row('2', 'B', 0.8, 4), row('3', 'C', 0.7, 3)]
    })
    const out = await retrieveChunks(
      { direction: 'Гражданское', grade: 6, topic: 'дружба', lang: 'russian' },
      { embed, queryCandidates, topK: 3, maxPerDoc: 2, candidates: 24 },
    )
    expect(queryCandidates).toHaveBeenCalledTimes(2)
    expect(out.length).toBe(3)
  })
})
