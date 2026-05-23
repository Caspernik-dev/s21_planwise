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
      { type: 'discussion', text: longText(3), questions: ['а?', 'б?', 'в?'] },
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
