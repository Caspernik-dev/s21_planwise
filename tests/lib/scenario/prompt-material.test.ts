import { buildBlockMessages, buildSkeletonMessages } from '@/lib/scenario/prompt'
import type { GenerationInput, ScenarioSkeleton } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const input: GenerationInput = {
  lessonType: 'rov',
  direction: 'Патриотическое',
  grade: 6,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа',
}

const skeleton: ScenarioSkeleton = {
  title: 'Дружба',
  goals: ['цель'],
  values: ['дружба'],
  coreMeanings: ['смысл'],
  materials: [],
  stages: [{ kind: 'main', title: 'Основная', duration_min: 20, blocks: [] }],
}

describe('инъекция [TEACHER_MATERIAL]', () => {
  it('skeleton: секция отсутствует без материала', () => {
    const msgs = buildSkeletonMessages(input, [], [])
    expect(msgs.map((m) => m.content).join('\n')).not.toContain('[TEACHER_MATERIAL]')
  })

  it('skeleton: секция присутствует с материалом', () => {
    const msgs = buildSkeletonMessages(input, [], [], 'Мой конспект про дружбу.')
    const text = msgs.map((m) => m.content).join('\n')
    expect(text).toContain('[TEACHER_MATERIAL]')
    expect(text).toContain('Мой конспект про дружбу.')
    expect(text).toContain('главный источник содержания')
  })

  it('block: секция присутствует с материалом', () => {
    const msgs = buildBlockMessages(
      input,
      skeleton,
      { kind: 'main', title: 'Основная', duration_min: 20 },
      { type: 'discussion', focus: 'дружба' },
      [],
      '',
      'Мой конспект про дружбу.',
    )
    const text = msgs.map((m) => m.content).join('\n')
    expect(text).toContain('[TEACHER_MATERIAL]')
    expect(text).toContain('Мой конспект про дружбу.')
  })
})
