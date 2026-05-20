import { detectAndAnonymize } from '@/lib/pii'
import { anonymize } from '@/lib/pii/anonymize'
import { detectPII } from '@/lib/pii/detect'
import { describe, expect, it } from 'vitest'

describe('anonymize', () => {
  it('заменяет одинаковое значение одним и тем же плейсхолдером (детерминизм)', () => {
    const text = 'Анна пришла. Потом Анна ушла.'
    const { text: out } = anonymize(text, detectPII(text))
    // biome-ignore lint/style/noNonNullAssertion: placeholders guaranteed present in this fixture
    const ph = out.match(/\[Имя_\d+\]/g)!
    expect(ph[0]).toBe(ph[1])
    expect(out).not.toContain('Анна')
  })

  it('разные значения получают разные номера', () => {
    const text = 'Анна и Пётр'
    const { text: out } = anonymize(text, detectPII(text))
    expect(out).toMatch(/\[Имя_1\].*\[Имя_2\]/)
  })

  it('использует осмысленные ярлыки по типу', () => {
    const text = 'тел +79001234567 почта a@b.ru'
    const { text: out } = anonymize(text, detectPII(text))
    expect(out).toContain('[Телефон_1]')
    expect(out).toContain('[Email_1]')
  })

  it('сохраняет неизменными участки без ПДн', () => {
    const text = 'Цель: обсудить дружбу. Анна — ведущая.'
    const { text: out } = anonymize(text, detectPII(text))
    expect(out.startsWith('Цель: обсудить дружбу.')).toBe(true)
  })
})

describe('detectAndAnonymize', () => {
  it('возвращает original, anonymized, matches и replacements', () => {
    const r = detectAndAnonymize('Анна, тел 89001234567')
    expect(r.original).toBe('Анна, тел 89001234567')
    expect(r.anonymized).not.toContain('Анна')
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.replacements.length).toBeGreaterThan(0)
  })

  it('на чистом тексте anonymized === original и matches пуст', () => {
    const r = detectAndAnonymize('Обсуждаем взаимопомощь в классе.')
    expect(r.anonymized).toBe(r.original)
    expect(r.matches).toHaveLength(0)
  })
})
