import type { CanonicalDirection, Level } from '@/lib/scenario/levels'
import {
  CATALOG,
  getCatalog,
  selectPersonalResults,
  validateAgainstCatalog,
} from '@/lib/scenario/personal-results'
import { describe, expect, it } from 'vitest'

describe('Каталог: новое направление «Адаптация…»', () => {
  it('ООО + Адаптация → непустой набор формулировок (≥3)', () => {
    const items = getCatalog('OOO', 'Адаптация к изменяющимся условиям')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it('СОО + Адаптация → непустой набор (≥3)', () => {
    const items = getCatalog('SOO', 'Адаптация к изменяющимся условиям')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it('НОО + Адаптация → пустой массив (нормативно отсутствует в приказе № 286)', () => {
    const items = getCatalog('NOO', 'Адаптация к изменяющимся условиям')
    expect(items).toEqual([])
  })

  it('selectPersonalResults для НОО+Адаптация — возвращает []', () => {
    const items = selectPersonalResults([], getCatalog('NOO', 'Адаптация к изменяющимся условиям'))
    expect(items).toEqual([])
  })
})

const LEVELS: Level[] = ['NOO', 'OOO', 'SOO']
const CANONICAL: CanonicalDirection[] = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
]

describe('CATALOG', () => {
  it('содержит ячейку для каждой пары (уровень, каноническое направление)', () => {
    for (const lvl of LEVELS) {
      for (const dir of CANONICAL) {
        expect(CATALOG[lvl][dir]).toBeDefined()
        expect(CATALOG[lvl][dir].length).toBeGreaterThan(0)
      }
    }
  })
  it('каждая формулировка непустая и trim-ed', () => {
    for (const lvl of LEVELS) {
      for (const dir of CANONICAL) {
        for (const f of CATALOG[lvl][dir]) {
          expect(f.trim()).toBe(f)
          expect(f.length).toBeGreaterThan(10)
        }
      }
    }
  })
})

describe('getCatalog', () => {
  it('возвращает ячейку по каноническому направлению напрямую', () => {
    expect(getCatalog('NOO', 'Патриотическое')).toBe(CATALOG.NOO.Патриотическое)
  })
  it('маппит UI-лейблы на канонические (Семейные ценности → Духовно-нравственное)', () => {
    expect(getCatalog('OOO', 'Семейные ценности')).toBe(CATALOG.OOO['Духовно-нравственное'])
  })
  it('маппит ЗОЖ → Физическое и здоровье', () => {
    expect(getCatalog('SOO', 'Здоровый образ жизни')).toBe(CATALOG.SOO['Физическое и здоровье'])
  })
})

describe('validateAgainstCatalog', () => {
  const catalog = ['Формулировка А', 'Формулировка Б', 'Формулировка В']
  it('пропускает только строки из каталога', () => {
    expect(validateAgainstCatalog(['Формулировка А', 'Левая фраза'], catalog)).toEqual([
      'Формулировка А',
    ])
  })
  it('нормализует множественные пробелы', () => {
    expect(validateAgainstCatalog(['  Формулировка   А  '], catalog)).toEqual(['Формулировка А'])
  })
  it('пустой вход → пустой выход', () => {
    expect(validateAgainstCatalog([], catalog)).toEqual([])
  })
})

describe('selectPersonalResults', () => {
  const catalog = ['А', 'Б', 'В', 'Г', 'Д', 'Е']
  it('возвращает валидный вход, если >=3', () => {
    expect(selectPersonalResults(['А', 'Б', 'В'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('обрезает до 5', () => {
    expect(selectPersonalResults(['А', 'Б', 'В', 'Г', 'Д', 'Е'], catalog)).toEqual([
      'А',
      'Б',
      'В',
      'Г',
      'Д',
    ])
  })
  it('добирает из каталога, если валидных <3', () => {
    expect(selectPersonalResults(['А'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('добирает из каталога при undefined/пустом входе', () => {
    expect(selectPersonalResults(undefined, catalog)).toEqual(['А', 'Б', 'В'])
    expect(selectPersonalResults([], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('дедуплицирует валидные', () => {
    expect(selectPersonalResults(['А', 'А', 'Б'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('игнорирует невалидные, добирает первыми из каталога', () => {
    expect(selectPersonalResults(['А', 'мусор', 'ещё мусор'], catalog)).toEqual(['А', 'Б', 'В'])
  })
})
