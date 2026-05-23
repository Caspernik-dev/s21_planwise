import { buildSkeletonMessages } from '@/lib/scenario/prompt'
import { skeletonSchema } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const input = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа' as const,
}

describe('buildSkeletonMessages', () => {
  it('просит только каркас без activities', () => {
    const msgs = buildSkeletonMessages(input, [], [])
    const sys = msgs[0].content
    expect(msgs).toHaveLength(2)
    expect(sys).toContain('duration_min')
    expect(sys).not.toContain('activities')
    expect(msgs[1].content).toContain('Дружба')
  })
})

describe('skeletonSchema', () => {
  it('валидирует корректный каркас', () => {
    const r = skeletonSchema.safeParse({
      title: 'T',
      goals: ['g'],
      stages: [{ kind: 'engage', title: 'S', duration_min: 5 }],
    })
    expect(r.success).toBe(true)
  })
})
