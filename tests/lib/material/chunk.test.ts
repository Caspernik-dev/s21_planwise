import { chunkMaterial } from '@/lib/material/chunk'
import { describe, expect, it } from 'vitest'

describe('chunkMaterial', () => {
  it('возвращает пустой массив на пустом/пробельном тексте', () => {
    expect(chunkMaterial('')).toEqual([])
    expect(chunkMaterial('   \n\n  ')).toEqual([])
  })

  it('упаковывает короткие абзацы в одно окно', () => {
    const text = 'Первый абзац.\n\nВторой абзац.\n\nТретий абзац.'
    const chunks = chunkMaterial(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Первый абзац.')
    expect(chunks[0]).toContain('Третий абзац.')
  })

  it('разбивает длинный текст на несколько окон (~800 токенов = ~2400 символов)', () => {
    const para = `${'а'.repeat(2000)}.`
    const text = [para, para, para].join('\n\n')
    const chunks = chunkMaterial(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('режет одиночный сверхдлинный абзац на куски', () => {
    const chunks = chunkMaterial('б'.repeat(5000))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2400)
  })
})
