import { selectRelevantMaterial } from '@/lib/material/retrieve'
import { describe, expect, it, vi } from 'vitest'

// мок-embed: query «дружба» и чанки со стемом «друж» → [1,0] (cosine=1); без — [0,1] (cosine=0)
function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map((t) => (t.toLowerCase().includes('друж') ? [1, 0] : [0, 1])))
}

describe('selectRelevantMaterial', () => {
  it('ставит релевантные теме чанки первыми', async () => {
    const text = 'Про погоду и природу зимой.\n\nГлава про дружбу и взаимопомощь между людьми.'
    const { text: out } = await selectRelevantMaterial(text, 'дружба', {
      embed: fakeEmbed,
      maxChunks: 40,
      topK: 1,
      maxChars: 6000,
    })
    expect(out).toContain('дружбу')
    expect(out).not.toContain('погоду')
  })

  it('соблюдает maxChars', async () => {
    const text = `${'дружба '.repeat(500)}\n\n${'дружба '.repeat(500)}`
    const { text: out } = await selectRelevantMaterial(text, 'дружба', {
      embed: fakeEmbed,
      maxChunks: 40,
      topK: 10,
      maxChars: 100,
    })
    expect(out.length).toBeLessThanOrEqual(100)
  })

  it('ограничивает число эмбеддимых чанков (maxChunks)', async () => {
    const spy = vi.fn(fakeEmbed)
    const text = Array.from({ length: 60 }, (_, i) => `дружба абзац ${i} ${'x'.repeat(2400)}`).join(
      '\n\n',
    )
    await selectRelevantMaterial(text, 'дружба', {
      embed: spy,
      maxChunks: 5,
      topK: 3,
      maxChars: 6000,
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].length).toBeLessThanOrEqual(6)
  })

  it('fallback на cap по символам при сбое embed', async () => {
    const failing = () => Promise.reject(new Error('network'))
    const text = 'дружба '.repeat(2000)
    const { text: out, truncated } = await selectRelevantMaterial(text, 'дружба', {
      embed: failing,
      maxChunks: 40,
      topK: 5,
      maxChars: 100,
    })
    expect(out.length).toBeLessThanOrEqual(100)
    expect(truncated).toBe(true)
  })
})
