import {
  PROMPT_VERSION,
  buildMessages,
  buildSkeletonMessages,
  buildStageDetailsMessages,
} from '@/lib/scenario/prompt'
import type { ScenarioSkeleton } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const input = {
  direction: 'Патриотическое' as const,
  grade: 6,
  topic: 'День Победы',
  durationMin: 30,
  format: 'классный час' as const,
}

describe('buildMessages', () => {
  it('returns a system and a user message', () => {
    const msgs = buildMessages(input)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
  })

  it('system message forbids real children names and demands JSON', () => {
    const sys = buildMessages(input)[0].content
    expect(sys.toLowerCase()).toContain('json')
    expect(sys.toLowerCase()).toContain('имена детей')
  })

  it('user message embeds all context fields', () => {
    const user = buildMessages(input)[1].content
    expect(user).toContain('Патриотическое')
    expect(user).toContain('6')
    expect(user).toContain('День Победы')
    expect(user).toContain('30')
    expect(user).toContain('классный час')
  })

  it('exposes a stable prompt version string', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION.length).toBeGreaterThan(0)
  })

  it('includes RELEVANT_METHODOLOGY block when rag chunks provided', () => {
    const msgs = buildMessages(
      {
        direction: 'Гражданское',
        grade: 6,
        topic: 'дружба',
        durationMin: 30,
        format: 'классный час',
      },
      [
        {
          text: 'Методический фрагмент про дружбу.',
          documentTitle: 'Методичка',
          sectionKind: 'stage',
        },
      ],
    )
    const user = msgs.find((m) => m.role === 'user')?.content ?? ''
    expect(user).toContain('RELEVANT_METHODOLOGY')
    expect(user).toContain('Методический фрагмент про дружбу.')
  })

  it('omits methodology block when no chunks provided', () => {
    const msgs = buildMessages({
      direction: 'Гражданское',
      grade: 6,
      topic: 'дружба',
      durationMin: 30,
      format: 'классный час',
    })
    const user = msgs.find((m) => m.role === 'user')?.content ?? ''
    expect(user).not.toContain('RELEVANT_METHODOLOGY')
  })
})

describe('buildSkeletonMessages', () => {
  it('каркас требует ценности и основные смыслы', () => {
    const sys = buildSkeletonMessages(input)[0].content
    expect(sys).toContain('values')
    expect(sys).toContain('coreMeanings')
    expect(sys.toLowerCase()).toContain('основные смыслы')
  })
})

describe('buildStageDetailsMessages', () => {
  const skeleton: ScenarioSkeleton = {
    title: 'День Победы',
    goals: ['Уважение к памяти'],
    coreMeanings: ['Память о подвиге объединяет поколения'],
    materials: [],
    stages: [{ kind: 'main', title: 'Разбор историй', duration_min: 20 }],
  } as ScenarioSkeleton

  it('просит активности одного этапа, передаёт смыслы и название этапа', () => {
    const msgs = buildStageDetailsMessages(input, skeleton, skeleton.stages[0])
    const sys = msgs[0].content
    const user = msgs[1].content
    expect(sys).toContain('activities')
    expect(sys).toContain('ТОЛЬКО для этого этапа')
    expect(user).toContain('Разбор историй')
    expect(user).toContain('Память о подвиге объединяет поколения')
  })

  it('включает методички, когда переданы чанки', () => {
    const msgs = buildStageDetailsMessages(input, skeleton, skeleton.stages[0], [
      { text: 'фрагмент', documentTitle: 'РоВ', sectionKind: 'stage' },
    ])
    expect(msgs[1].content).toContain('RELEVANT_METHODOLOGY')
  })
})
