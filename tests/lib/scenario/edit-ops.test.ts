import { moveActivity, moveStage } from '@/lib/scenario/edit-ops'
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
