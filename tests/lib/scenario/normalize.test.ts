import { normalizeChronometry } from '@/lib/scenario/normalize'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

function content(durations: number[]): ScenarioContent {
  return {
    title: 't',
    goals: ['g'],
    materials: [],
    stages: durations.map((d, i) => ({
      kind: i === 0 ? 'engage' : i === durations.length - 1 ? 'reflection' : 'main',
      title: `s${i}`,
      duration_min: d,
      activities: [{ type: 'discussion', text: 'x' }],
    })),
    adaptations: { simpler: 's', harder: 'h' },
  }
}

describe('normalizeChronometry', () => {
  it('leaves content unchanged when sum already equals target', () => {
    const { content: out, changed } = normalizeChronometry(content([5, 20, 5]), 30)
    expect(out.stages.map((s) => s.duration_min)).toEqual([5, 20, 5])
    expect(changed).toBe(false)
  })

  it('scales down proportionally and preserves exact total', () => {
    const { content: out, changed } = normalizeChronometry(content([10, 40, 10]), 30)
    const total = out.stages.reduce((a, s) => a + s.duration_min, 0)
    expect(total).toBe(30)
    expect(changed).toBe(true)
  })

  it('scales up and preserves exact total', () => {
    const { content: out } = normalizeChronometry(content([5, 10, 5]), 45)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(45)
  })

  it('keeps every stage at least 1 minute', () => {
    const { content: out } = normalizeChronometry(content([1, 1, 100]), 5)
    expect(out.stages.every((s) => s.duration_min >= 1)).toBe(true)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(5)
  })

  it('handles zero total defensively (distributes target evenly)', () => {
    const { content: out } = normalizeChronometry(content([0, 0]), 10)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(10)
    expect(out.stages.every((s) => s.duration_min >= 1)).toBe(true)
  })

  it('поднимает тонкую рефлексию до пола даже когда сумма уже равна target', () => {
    const { content: out, changed } = normalizeChronometry(content([14, 5, 1]), 20)
    const dur = out.stages.map((s) => s.duration_min)
    expect(changed).toBe(true)
    expect(dur.every((d) => d >= 3)).toBe(true)
    expect(dur.reduce((a, d) => a + d, 0)).toBe(20)
    expect(dur[dur.length - 1]).toBeGreaterThanOrEqual(3)
  })

  it('держит пол 3 мин на каждом этапе при перекошенном входе (20 мин / 3 этапа)', () => {
    const { content: out } = normalizeChronometry(content([1, 18, 1]), 20)
    const dur = out.stages.map((s) => s.duration_min)
    expect(dur.every((d) => d >= 3)).toBe(true)
    expect(dur.reduce((a, d) => a + d, 0)).toBe(20)
    expect(Math.max(...dur)).toBe(dur[1])
  })
})
