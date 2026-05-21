import {
  addActivity,
  addStage,
  moveActivity,
  moveStage,
  removeActivity,
  removeStage,
} from '@/lib/scenario/edit-ops'
import { scenarioContentSchema } from '@/lib/scenario/schema'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const base: ScenarioContent = {
  title: 'T',
  goals: ['g'],
  materials: [],
  stages: [
    {
      kind: 'engage',
      title: 'S0',
      duration_min: 5,
      activities: [
        { type: 'discussion', text: 'a0' },
        { type: 'task', text: 'a1' },
      ],
    },
    { kind: 'main', title: 'S1', duration_min: 10, activities: [{ type: 'game', text: 'b0' }] },
    {
      kind: 'reflection',
      title: 'S2',
      duration_min: 5,
      activities: [{ type: 'task', text: 'c0' }],
    },
  ],
  adaptations: { simpler: 's', harder: 'h' },
}

describe('moveStage', () => {
  it('перемещает этап вниз', () => {
    const r = moveStage(base, 0, 1)
    expect(r.stages.map((s) => s.title)).toEqual(['S1', 'S0', 'S2'])
  })
  it('перемещает этап вверх', () => {
    const r = moveStage(base, 2, -1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S2', 'S1'])
  })
  it('out-of-bounds (вверх с 0) → без изменений', () => {
    const r = moveStage(base, 0, -1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
  it('out-of-bounds (вниз с последнего) → без изменений', () => {
    const r = moveStage(base, 2, 1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
  it('не мутирует вход', () => {
    moveStage(base, 0, 1)
    expect(base.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
})

describe('moveActivity', () => {
  it('перемещает активность внутри этапа', () => {
    const r = moveActivity(base, 0, 0, 1)
    expect(r.stages[0].activities.map((a) => a.text)).toEqual(['a1', 'a0'])
  })
  it('out-of-bounds → без изменений', () => {
    const r = moveActivity(base, 0, 0, -1)
    expect(r.stages[0].activities.map((a) => a.text)).toEqual(['a0', 'a1'])
  })
  it('не трогает другие этапы', () => {
    const r = moveActivity(base, 0, 1, -1)
    expect(r.stages[1].activities.map((a) => a.text)).toEqual(['b0'])
  })
})

describe('addStage', () => {
  it('добавляет этап в конец', () => {
    const r = addStage(base)
    expect(r.stages).toHaveLength(4)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2', expect.any(String)])
  })
  it('новый этап проходит валидацию схемы', () => {
    const r = addStage(base)
    expect(scenarioContentSchema.safeParse(r).success).toBe(true)
  })
  it('новый этап содержит хотя бы одну активность', () => {
    const r = addStage(base)
    expect(r.stages[3].activities.length).toBeGreaterThanOrEqual(1)
  })
  it('не мутирует вход', () => {
    addStage(base)
    expect(base.stages).toHaveLength(3)
  })
})

describe('removeStage', () => {
  it('удаляет этап по индексу', () => {
    const r = removeStage(base, 1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S2'])
  })
  it('не удаляет последний оставшийся этап', () => {
    const one: ScenarioContent = { ...base, stages: [base.stages[0]] }
    const r = removeStage(one, 0)
    expect(r.stages).toHaveLength(1)
  })
  it('out-of-bounds → без изменений', () => {
    const r = removeStage(base, 9)
    expect(r.stages).toHaveLength(3)
  })
  it('не мутирует вход', () => {
    removeStage(base, 1)
    expect(base.stages).toHaveLength(3)
  })
})

describe('addActivity', () => {
  it('добавляет активность в конец этапа', () => {
    const r = addActivity(base, 1)
    expect(r.stages[1].activities).toHaveLength(2)
  })
  it('новая активность проходит валидацию схемы', () => {
    const r = addActivity(base, 1)
    expect(scenarioContentSchema.safeParse(r).success).toBe(true)
  })
  it('не трогает другие этапы', () => {
    const r = addActivity(base, 1)
    expect(r.stages[0].activities).toHaveLength(2)
  })
  it('out-of-bounds этап → без изменений', () => {
    const r = addActivity(base, 9)
    expect(r).toEqual(base)
  })
})

describe('removeActivity', () => {
  it('удаляет активность', () => {
    const r = removeActivity(base, 0, 0)
    expect(r.stages[0].activities.map((a) => a.text)).toEqual(['a1'])
  })
  it('не удаляет последнюю активность этапа', () => {
    const r = removeActivity(base, 1, 0)
    expect(r.stages[1].activities).toHaveLength(1)
  })
  it('out-of-bounds → без изменений', () => {
    const r = removeActivity(base, 0, 9)
    expect(r.stages[0].activities).toHaveLength(2)
  })
  it('не мутирует вход', () => {
    removeActivity(base, 0, 0)
    expect(base.stages[0].activities).toHaveLength(2)
  })
})
