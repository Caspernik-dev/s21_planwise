import { detectPII } from '@/lib/pii/detect'
import { describe, expect, it } from 'vitest'

describe('detectPII', () => {
  it('объединяет матчи разных детекторов', () => {
    const types = detectPII('Иванова Мария Петровна, тел +79123456789, почта m@x.ru').map(
      (x) => x.type,
    )
    expect(types).toContain('name')
    expect(types).toContain('phone')
    expect(types).toContain('email')
  })

  it('возвращает матчи, отсортированные по позиции', () => {
    const m = detectPII('почта a@b.ru, телефон 89001234567')
    for (let i = 1; i < m.length; i++) expect(m[i].start).toBeGreaterThanOrEqual(m[i - 1].start)
  })

  it('снимает пересечения (нет наложенных диапазонов)', () => {
    const m = detectPII('ул. Ленина д.5 кв.12, Анна Иванова, +7 900 123 45 67')
    for (let i = 1; i < m.length; i++) expect(m[i].start).toBeGreaterThanOrEqual(m[i - 1].end)
  })

  it('на чистом тексте без ПДн возвращает пустой массив', () => {
    expect(detectPII('Цель занятия — обсудить дружбу и взаимопомощь в классе.')).toHaveLength(0)
  })
})
