import { skeletonSchema } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

describe('skeletonSchema with blocks', () => {
  it('принимает этапы с контент-планом blocks', () => {
    const r = skeletonSchema.safeParse({
      title: 'Дружба',
      goals: ['ценность дружбы'],
      stages: [
        {
          kind: 'main',
          title: 'Основа',
          duration_min: 10,
          blocks: [
            { type: 'discussion', focus: 'что такое настоящая дружба' },
            { type: 'game', focus: 'игра на доверие' },
          ],
        },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.stages[0].blocks).toHaveLength(2)
  })

  it('blocks опциональны (этап без плана валиден)', () => {
    const r = skeletonSchema.safeParse({
      title: 'X',
      goals: ['g'],
      stages: [{ kind: 'engage', title: 'Старт', duration_min: 5 }],
    })
    expect(r.success).toBe(true)
  })

  it('отбрасывает бриф без focus', () => {
    const r = skeletonSchema.safeParse({
      title: 'X',
      goals: ['g'],
      stages: [{ kind: 'main', title: 'M', duration_min: 5, blocks: [{ type: 'discussion' }] }],
    })
    expect(r.success).toBe(false)
  })
})
