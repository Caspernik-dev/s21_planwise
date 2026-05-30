import type { CanonicalDirection, Level } from '@/lib/scenario/levels'
import { CATALOG, getCatalog } from '@/lib/scenario/personal-results'
import { describe, expect, it } from 'vitest'

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
