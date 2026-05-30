import { canonicalDirection, gradeToLevel, levelLabel } from '@/lib/scenario/levels'
import { describe, expect, it } from 'vitest'

describe('gradeToLevel', () => {
  it('маппит 1-4 → НОО', () => {
    for (const g of [1, 2, 3, 4]) expect(gradeToLevel(g)).toBe('NOO')
  })
  it('маппит 5-9 → ООО', () => {
    for (const g of [5, 6, 7, 8, 9]) expect(gradeToLevel(g)).toBe('OOO')
  })
  it('маппит 10-11 → СОО', () => {
    for (const g of [10, 11]) expect(gradeToLevel(g)).toBe('SOO')
  })
  it('маппит 12 (СПО) → СОО', () => {
    expect(gradeToLevel(12)).toBe('SOO')
  })
})

describe('canonicalDirection', () => {
  it('канонические — identity', () => {
    expect(canonicalDirection('Гражданское')).toBe('Гражданское')
    expect(canonicalDirection('Патриотическое')).toBe('Патриотическое')
    expect(canonicalDirection('Познавательное')).toBe('Познавательное')
    expect(canonicalDirection('Физическое и здоровье')).toBe('Физическое и здоровье')
  })
  it('Семейные ценности → Духовно-нравственное', () => {
    expect(canonicalDirection('Семейные ценности')).toBe('Духовно-нравственное')
  })
  it('Профориентация → Трудовое', () => {
    expect(canonicalDirection('Профориентация')).toBe('Трудовое')
  })
  it('Здоровый образ жизни → Физическое и здоровье', () => {
    expect(canonicalDirection('Здоровый образ жизни')).toBe('Физическое и здоровье')
  })
})

describe('levelLabel', () => {
  it('возвращает короткие лейблы', () => {
    expect(levelLabel('NOO')).toBe('НОО')
    expect(levelLabel('OOO')).toBe('ООО')
    expect(levelLabel('SOO')).toBe('СОО')
  })
})
