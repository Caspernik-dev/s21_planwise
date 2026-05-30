import { describe, expect, it } from 'vitest'
import { scenarioDirectionValue } from '@/lib/scenario/scenario-fields'
import type { GenerationInput } from '@/lib/scenario/schema'

describe('scenarioDirectionValue', () => {
  it('rov: возвращает direction', () => {
    expect(
      scenarioDirectionValue({ lessonType: 'rov', direction: 'Патриотическое' } as GenerationInput),
    ).toBe('Патриотическое')
  })

  it('event: возвращает direction', () => {
    expect(
      scenarioDirectionValue({ lessonType: 'event', direction: 'Эстетическое' } as GenerationInput),
    ).toBe('Эстетическое')
  })

  it('subject_extension: возвращает subject', () => {
    expect(
      scenarioDirectionValue({
        lessonType: 'subject_extension',
        subject: 'Физика',
      } as GenerationInput),
    ).toBe('Физика')
  })

  it('literacy: возвращает лейбл вида грамотности', () => {
    expect(
      scenarioDirectionValue({
        lessonType: 'literacy',
        literacyKind: 'math',
      } as GenerationInput),
    ).toBe('Математическая грамотность')
  })

  it('krujok: возвращает «—»', () => {
    expect(scenarioDirectionValue({ lessonType: 'krujok' } as GenerationInput)).toBe('—')
  })

  it('rov без direction: возвращает пустую строку', () => {
    expect(scenarioDirectionValue({ lessonType: 'rov' } as GenerationInput)).toBe('')
  })

  it('literacy без literacyKind: возвращает пустую строку', () => {
    expect(scenarioDirectionValue({ lessonType: 'literacy' } as GenerationInput)).toBe('')
  })

  it('subject_extension без subject: возвращает пустую строку', () => {
    expect(
      scenarioDirectionValue({ lessonType: 'subject_extension' } as GenerationInput),
    ).toBe('')
  })
})
