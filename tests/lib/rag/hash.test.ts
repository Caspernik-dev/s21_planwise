import { chunkHash } from '@/lib/rag/hash'
import { describe, expect, it } from 'vitest'

describe('chunkHash', () => {
  it('returns a 64-char hex sha256', () => {
    const h = chunkHash('привет мир')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for identical input', () => {
    expect(chunkHash('один и тот же текст')).toBe(chunkHash('один и тот же текст'))
  })

  it('differs for different input', () => {
    expect(chunkHash('a')).not.toBe(chunkHash('b'))
  })
})
