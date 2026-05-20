import { chunkStructured, estimateTokens } from '@/lib/rag/chunk'
import { describe, expect, it } from 'vitest'

const para = (label: string, chars: number) => `${label} ${'я'.repeat(chars)}`

describe('estimateTokens', () => {
  it('approximates ~chars/3', () => {
    expect(estimateTokens('я'.repeat(300))).toBe(100)
  })
})

describe('chunkStructured', () => {
  it('splits by markdown headings and labels section_kind', () => {
    const text = [
      '## Цель',
      para('развить', 1200),
      '## Ход занятия. Этап 1',
      para('вступление', 1200),
      '## Рефлексия',
      para('обсуждение', 1200),
    ].join('\n\n')
    const chunks = chunkStructured(text)
    const kinds = chunks.map((c) => c.sectionKind)
    expect(kinds).toContain('goal')
    expect(kinds).toContain('stage')
    expect(kinds).toContain('reflection')
    const stage = chunks.find((c) => c.sectionKind === 'stage')
    expect(stage?.stageIdx).toBe(1)
  })

  it('keeps every chunk under the 800-token max by splitting large sections', () => {
    const huge = ['## Ход занятия', para('часть', 9000)].join('\n\n')
    const chunks = chunkStructured(huge)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(estimateTokens(c.text)).toBeLessThanOrEqual(800)
    }
  })

  it('merges tiny adjacent sections to reach the 300-token min when possible', () => {
    const text = [
      '## Материалы',
      para('бумага', 150),
      '## Заметка',
      para('ещё', 150),
      '## Заметка 2',
      para('и ещё', 900),
    ].join('\n\n')
    const chunks = chunkStructured(text)
    expect(chunks.length).toBeLessThan(3)
  })

  it('detects keyword headings in plain (non-markdown) text', () => {
    const text = ['Цель:', para('a', 1000), 'Рефлексия:', para('b', 1000)].join('\n\n')
    const chunks = chunkStructured(text)
    expect(chunks.map((c) => c.sectionKind)).toEqual(expect.arrayContaining(['goal', 'reflection']))
  })

  it('returns no empty chunks', () => {
    const chunks = chunkStructured('## Цель\n\n\n\n## Рефлексия\n\nтекст')
    for (const c of chunks) expect(c.text.trim().length).toBeGreaterThan(0)
  })
})
