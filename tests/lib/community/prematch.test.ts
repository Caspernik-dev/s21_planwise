import { filterByThreshold, prematchShared } from '@/lib/community/prematch'
import { describe, expect, it } from 'vitest'

const rows = [
  { id: 'a', similarity: 0.9 },
  { id: 'b', similarity: 0.6 },
  { id: 'c', similarity: 0.8 },
  { id: 'd', similarity: 0.85 },
]

describe('filterByThreshold', () => {
  it('keeps only >= threshold, sorted desc, top-K', () => {
    const out = filterByThreshold(rows, 0.78, 3)
    expect(out.map((r) => r.id)).toEqual(['a', 'd', 'c'])
  })
  it('returns empty when nothing passes', () => {
    expect(filterByThreshold(rows, 0.95, 3)).toEqual([])
  })
})

describe('prematchShared', () => {
  it('embeds query and applies threshold/topK over injected rows', async () => {
    const out = await prematchShared(
      { lessonType: 'rov', direction: 'Гражданское', grade: 5, topic: 'дружба', format: 'беседа' },
      {
        embed: async () => [[0.1, 0.2]],
        queryRows: async () => [
          {
            id: 'x',
            title: 'X',
            direction: 'Гражданское',
            grade: 5,
            format: 'беседа',
            topic: 'дружба',
            likeCount: 3,
            anonymizedContent: {},
            similarity: 0.91,
          },
          {
            id: 'y',
            title: 'Y',
            direction: 'Гражданское',
            grade: 6,
            format: 'беседа',
            topic: 'дружба',
            likeCount: 1,
            anonymizedContent: {},
            similarity: 0.5,
          },
        ],
        threshold: 0.78,
        topK: 3,
        gradeSpan: 2,
      },
    )
    expect(out.map((r) => r.id)).toEqual(['x'])
  })

  it('passes lessonType to queryRows as part of the query', async () => {
    const capturedQueries: Array<{ q: unknown }> = []
    await prematchShared(
      {
        lessonType: 'krujok',
        direction: 'Познавательное',
        grade: 5,
        topic: 'Робототехника Arduino',
        format: 'мастер-класс',
      },
      {
        embed: async () => [[0, 1]],
        queryRows: async (_vec, q, _span) => {
          capturedQueries.push({ q })
          return []
        },
        threshold: 0.5,
        topK: 3,
        gradeSpan: 2,
      },
    )
    expect(capturedQueries).toHaveLength(1)
    expect((capturedQueries[0].q as { lessonType: string }).lessonType).toBe('krujok')
  })
})
