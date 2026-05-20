import { scanScenarioPii } from '@/lib/pii/scenario-scan'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const base: ScenarioContent = {
  title: 'Дружба',
  goals: ['Развивать эмпатию'],
  materials: ['Карточки'],
  stages: [
    {
      kind: 'engage',
      title: 'Вступление',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Поговорим о дружбе' }],
    },
  ],
  adaptations: { simpler: 'Проще', harder: 'Сложнее' },
}

describe('scanScenarioPii', () => {
  it('возвращает null, когда ПДн нет', () => {
    expect(scanScenarioPii(base)).toBeNull()
  })
  it('находит телефон в тексте активности', () => {
    const c = structuredClone(base)
    c.stages[0].activities[0].text = 'Звоните +7 999 123-45-67'
    const r = scanScenarioPii(c)
    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('phone')
  })
  it('находит email в вопросах', () => {
    const c = structuredClone(base)
    c.stages[0].activities[0].questions = ['Пишите на ivan@example.com']
    const r = scanScenarioPii(c)
    expect(r?.kinds).toContain('email')
  })
})
