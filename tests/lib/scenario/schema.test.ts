import { generationInputSchema, scenarioContentSchema } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const validContent = {
  title: 'Дружба и взаимопомощь',
  goals: ['Сформировать представление о ценности дружбы'],
  materials: ['Проектор', 'Карточки с ситуациями'],
  stages: [
    {
      kind: 'engage',
      title: 'Введение',
      duration_min: 5,
      activities: [
        { type: 'discussion', text: 'Что такое дружба?', questions: ['Кого вы считаете другом?'] },
      ],
    },
    {
      kind: 'main',
      title: 'Основная часть',
      duration_min: 20,
      activities: [{ type: 'game', text: 'Игра на доверие' }],
    },
    {
      kind: 'reflection',
      title: 'Рефлексия',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Что нового узнали?' }],
    },
  ],
  adaptations: { simpler: 'Упростить вопросы', harder: 'Добавить дебаты' },
}

describe('scenarioContentSchema', () => {
  it('accepts a well-formed scenario', () => {
    expect(scenarioContentSchema.safeParse(validContent).success).toBe(true)
  })

  it('rejects empty stages', () => {
    const bad = { ...validContent, stages: [] }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown stage kind', () => {
    const bad = { ...validContent, stages: [{ ...validContent.stages[0], kind: 'wrong' }] }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown activity type', () => {
    const bad = {
      ...validContent,
      stages: [
        {
          ...validContent.stages[0],
          activities: [{ type: 'song', text: 'x' }],
        },
        validContent.stages[1],
        validContent.stages[2],
      ],
    }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects missing adaptations', () => {
    const { adaptations, ...rest } = validContent
    expect(scenarioContentSchema.safeParse(rest).success).toBe(false)
  })
})

describe('generationInputSchema', () => {
  it('accepts valid form input', () => {
    const r = generationInputSchema.safeParse({
      direction: 'Патриотическое',
      grade: '5',
      topic: 'День Победы',
      durationMin: '30',
      format: 'классный час',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.grade).toBe(5)
      expect(r.data.durationMin).toBe(30)
    }
  })

  it('rejects out-of-range grade', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '12',
        topic: 'x',
        durationMin: '30',
        format: 'классный час',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown format', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '5',
        topic: 'x',
        durationMin: '30',
        format: 'лекция',
      }).success,
    ).toBe(false)
  })

  it('rejects empty topic', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '5',
        topic: '   ',
        durationMin: '30',
        format: 'классный час',
      }).success,
    ).toBe(false)
  })
})
