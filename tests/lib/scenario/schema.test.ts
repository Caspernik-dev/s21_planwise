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

  it('accepts СПО sentinel grade (12)', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '12',
        topic: 'x',
        durationMin: '30',
        format: 'классный час',
      }).success,
    ).toBe(true)
  })

  it('rejects out-of-range grade', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '13',
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

describe('generationInputSchema (возрастной кап)', () => {
  const base = {
    direction: 'Патриотическое' as const,
    topic: 'День Победы',
    format: 'беседа' as const,
  }
  it('1 класс, 35 мин → ok', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 1, durationMin: 35 })
    expect(r.success).toBe(true)
  })
  it('1 класс, 45 мин → ошибка', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 1, durationMin: 45 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['durationMin'])
  })
  it('5 класс, 45 мин → ok', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 5, durationMin: 45 })
    expect(r.success).toBe(true)
  })
  it('5 класс, 60 мин → ошибка', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 5, durationMin: 60 })
    expect(r.success).toBe(false)
  })
  it('11 класс, 45 мин → ok; 11 класс, 60 → ошибка', () => {
    expect(generationInputSchema.safeParse({ ...base, grade: 11, durationMin: 45 }).success).toBe(
      true,
    )
    expect(generationInputSchema.safeParse({ ...base, grade: 11, durationMin: 60 }).success).toBe(
      false,
    )
  })
})

describe('scenarioContentSchema (personalResults optional)', () => {
  const minimal = {
    title: 'T',
    goals: ['g'],
    materials: [],
    stages: [
      {
        kind: 'engage' as const,
        title: 'e',
        duration_min: 5,
        activities: [{ type: 'discussion' as const, text: 'x' }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }
  it('валиден без personalResults (совместимость со старыми сценариями)', () => {
    expect(scenarioContentSchema.safeParse(minimal).success).toBe(true)
  })
  it('валиден с personalResults', () => {
    expect(
      scenarioContentSchema.safeParse({ ...minimal, personalResults: ['А', 'Б', 'В'] }).success,
    ).toBe(true)
  })
})
