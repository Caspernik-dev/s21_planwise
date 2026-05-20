import { combineScore, diversify, normalizeBm25, rankAndDiversify } from '@/lib/rag/score'
import { describe, expect, it } from 'vitest'

describe('normalizeBm25', () => {
  it('min-max normalizes to [0,1]', () => {
    expect(normalizeBm25([2, 4, 0])).toEqual([0.5, 1, 0])
  })
  it('returns zeros when all equal (avoid div-by-zero)', () => {
    expect(normalizeBm25([3, 3, 3])).toEqual([0, 0, 0])
  })
  it('handles empty', () => {
    expect(normalizeBm25([])).toEqual([])
  })
})

describe('combineScore', () => {
  it('weights 0.7 cosine + 0.3 bm25', () => {
    expect(combineScore(1, 0)).toBeCloseTo(0.7)
    expect(combineScore(0, 1)).toBeCloseTo(0.3)
    expect(combineScore(0.5, 0.5)).toBeCloseTo(0.5)
  })
})

describe('diversify', () => {
  it('limits to maxPerDoc chunks per documentId, preserving order', () => {
    const items = [
      { documentId: 'A', score: 0.9 },
      { documentId: 'A', score: 0.8 },
      { documentId: 'A', score: 0.7 },
      { documentId: 'B', score: 0.6 },
    ]
    const out = diversify(items, 2)
    expect(out.map((x) => x.score)).toEqual([0.9, 0.8, 0.6])
  })
})

describe('rankAndDiversify', () => {
  it('combines, sorts desc, diversifies, and takes topK', () => {
    const candidates = [
      { id: '1', documentId: 'A', cosine: 0.9, bm25: 10 },
      { id: '2', documentId: 'A', cosine: 0.85, bm25: 8 },
      { id: '3', documentId: 'A', cosine: 0.8, bm25: 6 },
      { id: '4', documentId: 'B', cosine: 0.5, bm25: 4 },
      { id: '5', documentId: 'C', cosine: 0.4, bm25: 2 },
    ]
    const out = rankAndDiversify(candidates, { topK: 3, maxPerDoc: 2 })
    expect(out.map((x) => x.id)).toEqual(['1', '2', '4'])
    expect(out[0].score).toBeGreaterThan(out[1].score)
  })
})
