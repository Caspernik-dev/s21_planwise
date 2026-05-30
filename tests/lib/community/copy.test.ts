import { sharedToScenarioInsert } from '@/lib/community/copy'
import { describe, expect, it } from 'vitest'

const shared = {
  id: 'shared-1',
  anonymizedContent: {
    title: 'Дружба',
    goals: ['g'],
    materials: [],
    stages: [],
    adaptations: { simpler: 'a', harder: 'b' },
  },
  direction: 'Гражданское',
  grade: 5,
  durationMin: 30,
  format: 'беседа',
  topic: 'дружба',
  lessonType: 'rov' as const,
}

describe('sharedToScenarioInsert', () => {
  it('maps shared into a personal scenario insert with source_shared_id', () => {
    const ins = sharedToScenarioInsert(shared, 'user-1')
    expect(ins.userId).toBe('user-1')
    expect(ins.sourceSharedId).toBe('shared-1')
    expect(ins.title).toBe('Дружба')
    expect(ins.direction).toBe('Гражданское')
    expect(ins.content).toEqual(shared.anonymizedContent)
    expect(ins.lessonType).toBe('rov')
    expect(ins.inputContext).toEqual({
      lessonType: 'rov',
      direction: 'Гражданское',
      grade: 5,
      topic: 'дружба',
      durationMin: 30,
      format: 'беседа',
    })
  })

  it('carries non-rov lessonType through to the insert', () => {
    const ins = sharedToScenarioInsert({ ...shared, lessonType: 'krujok' as const }, 'user-2')
    expect(ins.lessonType).toBe('krujok')
    expect(ins.inputContext.lessonType).toBe('krujok')
  })
})
