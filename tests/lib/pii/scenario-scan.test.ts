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
    expect(r?.count).toBeGreaterThan(0)
  })

  it('находит email в вопросах', () => {
    const c = structuredClone(base)
    c.stages[0].activities[0].questions = ['Пишите на ivan@example.com']
    const r = scanScenarioPii(c)

    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('email')
    expect(r?.count).toBeGreaterThan(0)
  })

  it('находит имя в материалах', () => {
    const c = structuredClone(base)
    c.materials = ['Подготовить карточку для Анны Ивановой']
    const r = scanScenarioPii(c)

    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('name')
  })

  it('находит ПДн в adaptations', () => {
    const c = structuredClone(base)
    c.adaptations.simpler = 'Связаться с родителем по телефону 8 999 123-45-67'
    const r = scanScenarioPii(c)

    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('phone')
  })

  it('находит несколько типов ПДн в одном сценарии', () => {
    const c = structuredClone(base)
    c.title = 'Занятие для Анны Ивановой'
    c.materials = ['Почта для связи: teacher@example.com']
    c.stages[0].activities[0].text = 'Телефон куратора: +7 999 123-45-67'

    const r = scanScenarioPii(c)

    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('name')
    expect(r?.kinds).toContain('email')
    expect(r?.kinds).toContain('phone')
    expect(r?.count).toBeGreaterThanOrEqual(3)
  })
})