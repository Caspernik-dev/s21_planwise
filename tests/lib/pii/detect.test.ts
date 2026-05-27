import { detectPII } from '@/lib/pii/detect'
import { describe, expect, it } from 'vitest'

const types = (text: string) => detectPII(text).map((m) => m.type)

describe('detectPII', () => {
  it('объединяет матчи разных детекторов', () => {
    const matches = detectPII('Иванова Мария Петровна, тел +79123456789, почта m@x.ru')

    expect(matches.map((x) => x.type)).toContain('name')
    expect(matches.map((x) => x.type)).toContain('phone')
    expect(matches.map((x) => x.type)).toContain('email')

    expect(matches.some((x) => x.value === 'Иванова Мария Петровна')).toBe(true)
    expect(matches.some((x) => x.value === '+79123456789')).toBe(true)
    expect(matches.some((x) => x.value === 'm@x.ru')).toBe(true)
  })

  it('возвращает матчи, отсортированные по позиции', () => {
    const matches = detectPII('почта [a@b.ru](mailto:a@b.ru), телефон 89001234567')
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].start)
    }
  })

  it('снимает пересечения (нет наложенных диапазонов)', () => {
    const matches = detectPII('ул. Ленина д.5 кв.12, Анна Иванова, +7 900 123 45 67')
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].end)
    }
  })

  it('оставляет более длинное совпадение вместо вложенного короткого', () => {
    const matches = detectPII('Анна Иванова пришла на занятие')
    const names = matches.filter((x) => x.type === 'name')

    expect(names).toHaveLength(1)
    expect(names[0]?.value).toBe('Анна Иванова')
  })

  it('детектит имя из словаря в обычном тексте', () => {
    expect(types('Анна подготовила классный час о дружбе')).toContain('name')
  })

  it('на чистом тексте без ПДн возвращает пустой массив', () => {
    expect(detectPII('Цель занятия — обсудить дружбу и взаимопомощь в классе.')).toHaveLength(0)
  })
})
