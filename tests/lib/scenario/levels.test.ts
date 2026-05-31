import {
  canonicalDirection,
  gradeToLevel,
  gradeToRovGroup,
  levelLabel,
  rovGroupLabel,
} from '@/lib/scenario/levels'
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

describe('gradeToRovGroup', () => {
  it.each([
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-4'],
    [4, '3-4'],
    [5, '5-7'],
    [6, '5-7'],
    [7, '5-7'],
    [8, '8-9'],
    [9, '8-9'],
    [10, '10-11'],
    [11, '10-11'],
    [12, 'СПО'],
  ])('grade %i → %s', (grade, expected) => {
    expect(gradeToRovGroup(grade)).toBe(expected)
  })
})

describe('canonicalDirection — новое направление «Адаптация…»', () => {
  it('Адаптация к изменяющимся условиям → Адаптация', () => {
    expect(canonicalDirection('Адаптация к изменяющимся условиям')).toBe('Адаптация')
  })
})

describe('levelLabel', () => {
  it('возвращает короткие лейблы', () => {
    expect(levelLabel('NOO')).toBe('НОО')
    expect(levelLabel('OOO')).toBe('ООО')
    expect(levelLabel('SOO')).toBe('СОО')
  })
})

describe('rovGroupLabel', () => {
  it('grade 1 → 1–2 классы', () => {
    expect(rovGroupLabel(1)).toBe('1–2 классы')
  })
  it('grade 7 → 5–7 классы', () => {
    expect(rovGroupLabel(7)).toBe('5–7 классы')
  })
  it('grade 11 → 10–11 классы', () => {
    expect(rovGroupLabel(11)).toBe('10–11 классы')
  })
  it('grade 12 → СПО', () => {
    expect(rovGroupLabel(12)).toBe('СПО')
  })
})
