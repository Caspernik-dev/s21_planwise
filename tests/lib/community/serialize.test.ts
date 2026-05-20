import { mapContentStrings, scenarioContentToText } from '@/lib/community/serialize'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const sample: ScenarioContent = {
  title: 'Дружба',
  goals: ['Цель A', 'Цель B'],
  materials: ['Бумага'],
  stages: [
    {
      kind: 'engage',
      title: 'Вступление',
      duration_min: 10,
      activities: [{ type: 'discussion', text: 'Обсудим', questions: ['Вопрос?'] }],
    },
  ],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
}

describe('scenarioContentToText', () => {
  it('includes every string field', () => {
    const t = scenarioContentToText(sample)
    for (const s of [
      'Дружба',
      'Цель A',
      'Цель B',
      'Бумага',
      'Вступление',
      'Обсудим',
      'Вопрос?',
      'проще',
      'сложнее',
    ]) {
      expect(t).toContain(s)
    }
  })
})

describe('mapContentStrings', () => {
  it('transforms every string field and preserves structure', () => {
    const out = mapContentStrings(sample, (s) => s.toUpperCase())
    expect(out.title).toBe('ДРУЖБА')
    expect(out.goals).toEqual(['ЦЕЛЬ A', 'ЦЕЛЬ B'])
    expect(out.stages[0].activities[0].text).toBe('ОБСУДИМ')
    expect(out.stages[0].activities[0].questions).toEqual(['ВОПРОС?'])
    expect(out.adaptations.simpler).toBe('ПРОЩЕ')
    expect(out.stages[0].duration_min).toBe(10)
  })
})
