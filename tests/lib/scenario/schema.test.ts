import { generationInputSchema, scenarioContentSchema } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

// ────────────────────────────────────────────────────────────────
// Task 5: новые тесты lessonType + superRefine + опц. поля контента
// ────────────────────────────────────────────────────────────────

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
      lessonType: 'rov',
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
        lessonType: 'rov',
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
        lessonType: 'rov',
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
        lessonType: 'rov',
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
        lessonType: 'rov',
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
    lessonType: 'rov' as const,
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

describe('generationInputSchema — lessonType', () => {
  const base = {
    topic: 'Дружба',
    grade: 5,
    durationMin: 30,
    format: 'беседа',
  }

  it('rov: direction обязательно', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'rov' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('direction'))).toBe(true)
  })

  it('rov: с direction — успех', () => {
    const r = generationInputSchema.safeParse({
      ...base,
      lessonType: 'rov',
      direction: 'Патриотическое',
    })
    expect(r.success).toBe(true)
  })

  it('event: direction обязательно', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'event' })
    expect(r.success).toBe(false)
  })

  it('subject_extension: subject обязателен; direction не обязателен', () => {
    const noSubj = generationInputSchema.safeParse({ ...base, lessonType: 'subject_extension' })
    expect(noSubj.success).toBe(false)
    const ok = generationInputSchema.safeParse({
      ...base,
      lessonType: 'subject_extension',
      subject: 'Физика',
    })
    expect(ok.success).toBe(true)
  })

  it('literacy: literacyKind обязателен', () => {
    const no = generationInputSchema.safeParse({ ...base, lessonType: 'literacy' })
    expect(no.success).toBe(false)
    const ok = generationInputSchema.safeParse({
      ...base,
      lessonType: 'literacy',
      literacyKind: 'math',
    })
    expect(ok.success).toBe(true)
  })

  it('krujok: достаточно темы — direction/subject/literacyKind не требуются', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'krujok' })
    expect(r.success).toBe(true)
  })

  it('СанПиН-кап работает на всех типах (krujok тоже)', () => {
    const r = generationInputSchema.safeParse({
      ...base,
      lessonType: 'krujok',
      grade: 1,
      durationMin: 60,
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('durationMin'))).toBe(true)
  })
})

describe('scenarioContentSchema — новые опц. поля', () => {
  const baseContent = {
    title: 'X',
    goals: ['G'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Вход',
        duration_min: 5,
        activities: [{ type: 'discussion', text: 'A' }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }

  it('базовый content без новых полей — валиден', () => {
    expect(scenarioContentSchema.safeParse(baseContent).success).toBe(true)
  })

  it('metaResults с непустыми элементами — ок', () => {
    expect(
      scenarioContentSchema.safeParse({
        ...baseContent,
        metaResults: ['уметь работать с информацией'],
      }).success,
    ).toBe(true)
  })

  it('subject + literacyKind принимаются', () => {
    expect(
      scenarioContentSchema.safeParse({
        ...baseContent,
        subject: 'Физика',
        literacyKind: 'math',
      }).success,
    ).toBe(true)
  })

  it('subjectResults массив строк принимается', () => {
    expect(
      scenarioContentSchema.safeParse({
        ...baseContent,
        subjectResults: ['решать задачи на оптимизацию'],
      }).success,
    ).toBe(true)
  })
})
