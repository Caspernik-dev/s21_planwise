import { GRADES, SPO_GRADE, formatGrade, formatGradeForPrompt } from '@/lib/scenario/options'
import { describe, expect, it } from 'vitest'

describe('grade options', () => {
  it('includes СПО sentinel as the last grade', () => {
    expect(SPO_GRADE).toBe(12)
    expect(GRADES).toContain(SPO_GRADE)
    expect(GRADES[GRADES.length - 1]).toBe(SPO_GRADE)
    expect(GRADES.filter((g) => g >= 1 && g <= 11)).toHaveLength(11)
  })

  it('formatGrade renders numeric grades as "N класс"', () => {
    expect(formatGrade(1)).toBe('1 класс')
    expect(formatGrade(11)).toBe('11 класс')
  })

  it('formatGrade renders СПО sentinel as "СПО"', () => {
    expect(formatGrade(SPO_GRADE)).toBe('СПО')
  })

  it('formatGradeForPrompt expands СПО, keeps "N класс" otherwise', () => {
    expect(formatGradeForPrompt(7)).toBe('7 класс')
    expect(formatGradeForPrompt(SPO_GRADE)).toBe(
      'обучающиеся СПО (среднее профессиональное образование)',
    )
  })
})
