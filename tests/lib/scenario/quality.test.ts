import { checkBlock, checkScenario } from '@/lib/scenario/quality'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const longText = (teacherTurns: number) =>
  Array.from(
    { length: teacherTurns },
    (_, i) => `Учитель: ${'фраза по теме. '.repeat(20)} (${i})`,
  ).join('\n')

describe('checkBlock', () => {
  it('плотный блок основной части проходит', () => {
    const r = checkBlock(
      {
        type: 'discussion',
        text: longText(3),
        questions: [
          'Что для тебя значит это?',
          'Почему это важно сегодня?',
          'Как ты поступишь в такой ситуации?',
        ],
      },
      'main',
    )
    expect(r.ok).toBe(true)
  })

  it('короткий текст не проходит', () => {
    const r = checkBlock({ type: 'task', text: 'мало' }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('коротк')
  })

  it('основная часть с одной репликой Учителя не проходит', () => {
    const r = checkBlock({ type: 'task', text: longText(1) }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('Учитель')
  })

  it('обсуждение с <3 вопросами не проходит', () => {
    const r = checkBlock({ type: 'discussion', text: longText(3), questions: ['а?'] }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('вопрос')
  })

  it('рефлексия не требует 2 реплик Учителя', () => {
    const oneTurnLong = `Учитель: ${'размышляем о дружбе и её ценности в нашей жизни. '.repeat(20)}`
    const r = checkBlock({ type: 'task', text: oneTurnLong }, 'reflection')
    expect(r.ok).toBe(true)
  })

  it('пустая реплика «Учитель:» не проходит', () => {
    const r = checkBlock({ type: 'task', text: `${longText(2)}\nУчитель:  ` }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('короткая')
  })

  it('discussion с коротким вопросом не проходит', () => {
    const r = checkBlock(
      {
        type: 'discussion',
        text: longText(3),
        questions: ['Что для тебя значит дружба?', 'А?', 'Почему важно дружить и помогать?'],
      },
      'main',
    )
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('вопрос')
  })
})

describe('checkScenario', () => {
  const big = (n: number) => 'я'.repeat(n)
  const base: ScenarioContent = {
    title: 'T',
    goals: ['g'],
    coreMeanings: ['дружба помогает преодолевать трудности'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Старт',
        duration_min: 5,
        activities: [{ type: 'discussion', text: big(5000) }],
      },
      {
        kind: 'main',
        title: 'Основа',
        duration_min: 10,
        activities: [{ type: 'task', text: `дружба ${big(5000)}` }],
      },
      {
        kind: 'reflection',
        title: 'Итоги',
        duration_min: 5,
        activities: [{ type: 'discussion', text: big(500), questions: ['Что было важно?'] }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }

  it('большой связный сценарий — без предупреждений', () => {
    expect(checkScenario(base).warnings).toHaveLength(0)
  })

  it('малый объём → предупреждение', () => {
    const small = {
      ...base,
      stages: [
        { ...base.stages[0], activities: [{ type: 'discussion' as const, text: 'коротко' }] },
      ],
    }
    expect(checkScenario(small).warnings.join(' ')).toContain('объём')
  })

  it('дубль заголовков этапов → предупреждение', () => {
    const dup = { ...base, stages: [base.stages[0], { ...base.stages[1], title: 'Старт' }] }
    expect(checkScenario(dup).warnings.join(' ')).toContain('заголовк')
  })
})

const padText = (n: number) => 'a'.repeat(n)

function withStages(stages: ScenarioContent['stages']): ScenarioContent {
  return {
    title: 'T',
    goals: ['g'],
    materials: [],
    stages,
    adaptations: { simpler: 's', harder: 'h' },
  }
}

describe('checkBlock — ветвление по lessonType', () => {
  it('rov: блок без «Учитель:» — thin (FAIL гейт)', () => {
    const block = {
      type: 'main',
      focus: 'x',
      text: 'А'.repeat(700),
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'rov' })
    expect(r.ok).toBe(false)
  })

  it('rov: блок с двумя «Учитель:»-репликами достаточной длины — PASS', () => {
    const teacherLong = `Учитель: ${'Б'.repeat(50)} Ответы обучающихся. Учитель: ${'В'.repeat(50)}`
    const block = {
      type: 'main',
      focus: 'x',
      text: `${teacherLong} ${'И'.repeat(700)}`,
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'rov' })
    expect(r.ok).toBe(true)
  })

  it('event: тот же РоВ-стиль (как rov)', () => {
    const block = {
      type: 'main',
      focus: 'x',
      text: 'А'.repeat(700),
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'event' })
    expect(r.ok).toBe(false)
  })

  it('krujok: «Учитель:» НЕ обязательно (Шаг N: достаточно), длина шага ≥200 — PASS', () => {
    const block = {
      type: 'main',
      focus: 'x',
      text: `Шаг 1: ${'А'.repeat(250)}`,
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'krujok' })
    expect(r.ok).toBe(true)
  })

  it('krujok: длина <200 — thin', () => {
    const block = { type: 'main', focus: 'x', text: `Шаг 1: ${'А'.repeat(50)}`, questions: [] }
    const r = checkBlock(block, 'main', { lessonType: 'krujok' })
    expect(r.ok).toBe(false)
  })

  it('krujok: нет прямой речи и шагов — гейт отбраковывает (защита от пересказа)', () => {
    const block = { type: 'main', focus: 'x', text: 'А'.repeat(250), questions: [] }
    const r = checkBlock(block, 'main', { lessonType: 'krujok' })
    expect(r.ok).toBe(false)
  })

  it('literacy: «Учитель:» или «Кейс:» достаточно', () => {
    const block = {
      type: 'main',
      focus: 'x',
      text: `Учитель: ${'А'.repeat(250)}`,
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'literacy' })
    expect(r.ok).toBe(true)
  })

  it('subject_extension: «Шаг N:» достаточно', () => {
    const block = {
      type: 'main',
      focus: 'x',
      text: `Шаг 1: ${'А'.repeat(250)}`,
      questions: [],
    }
    const r = checkBlock(block, 'main', { lessonType: 'subject_extension' })
    expect(r.ok).toBe(true)
  })
})

describe('checkScenario — ветвление по lessonType', () => {
  const withReflection = (text: string): ScenarioContent => ({
    title: 'T',
    goals: ['g'],
    materials: [],
    stages: [
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [{ type: 'task', text }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  })

  it('рефлексия-warning универсален (rov)', () => {
    const content = withReflection('Раздать карточки.')
    const { warnings } = checkScenario(content, { lessonType: 'rov' })
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(true)
  })

  it('рефлексия-warning универсален (krujok)', () => {
    const content = withReflection('Раздать карточки.')
    const { warnings } = checkScenario(content, { lessonType: 'krujok' })
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(true)
  })
})

describe('checkScenario — рефлексия', () => {
  it('warning, когда нет этапа рефлексии', () => {
    const content = withStages([
      {
        kind: 'engage',
        title: 'Вовлечение',
        duration_min: 5,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Что важно?'] }],
      },
      {
        kind: 'main',
        title: 'Основная',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['А что если?'] }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('нет этапа рефлексии'))).toBe(true)
  })

  it('warning, когда рефлексия есть, но без вопросов', () => {
    const content = withStages([
      {
        kind: 'main',
        title: 'M',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Q1'] }],
      },
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [{ type: 'task', text: 'Раздать карточки.' }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(true)
  })

  it('нет warning, когда рефлексия с вопросами в questions', () => {
    const content = withStages([
      {
        kind: 'main',
        title: 'M',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Q'] }],
      },
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [
          {
            type: 'discussion',
            text: padText(700),
            questions: ['Что для тебя было важно?'],
          },
        ],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии'))).toBe(false)
  })

  it('нет warning, когда вопрос вшит в text активности (содержит ?)', () => {
    const content = withStages([
      {
        kind: 'reflection',
        title: 'Р',
        duration_min: 5,
        activities: [{ type: 'task', text: 'Учитель: что вы возьмёте с собой?' }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(false)
  })
})

describe('checkScenario — физкультминутка', () => {
  const makeNooContent = (activityText: string): ScenarioContent =>
    withStages([
      {
        kind: 'engage',
        title: 'Вовлечение',
        duration_min: 10,
        activities: [{ type: 'task', text: activityText }],
      },
      {
        kind: 'main',
        title: 'Основная',
        duration_min: 25,
        activities: [{ type: 'task', text: activityText }],
      },
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [{ type: 'task', text: 'Что было важно?' }],
      },
    ])

  it('warning физкультминутки для НОО ≥40 мин без двигательной паузы', () => {
    const content = makeNooContent(padText(700))
    const { warnings } = checkScenario(content, { grade: 3, durationMin: 40 })
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(true)
  })

  it('нет warning физкультминутки для ООО (grade=5)', () => {
    const content = makeNooContent(padText(700))
    const { warnings } = checkScenario(content, { grade: 5, durationMin: 40 })
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(false)
  })

  it('нет warning если в тексте активности есть физкультминутка', () => {
    const content = makeNooContent(`Физкультминутка. Встаньте. ${padText(700)}`)
    const { warnings } = checkScenario(content, { grade: 3, durationMin: 40 })
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(false)
  })
})
