import {
  PROMPT_VERSION,
  buildBlockMessages,
  buildMessages,
  buildSkeletonMessages,
} from '@/lib/scenario/prompt'
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

const skeletonInputT4 = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа' as const,
}

const skeletonT4 = {
  title: 'Дружба',
  goals: ['ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  stages: [{ kind: 'main' as const, title: 'Основа', duration_min: 15 }],
}

describe('buildSkeletonMessages content-plan', () => {
  it('требует контент-план blocks в схеме каркаса', () => {
    const sys = buildSkeletonMessages(skeletonInputT4)[0].content
    expect(sys).toContain('blocks')
  })
})

describe('buildBlockMessages', () => {
  it('содержит бриф, тему и просит ОДИН блок', () => {
    const msgs = buildBlockMessages(
      skeletonInputT4,
      skeletonT4,
      skeletonT4.stages[0],
      { type: 'discussion', focus: 'что значит быть настоящим другом' },
      [],
      '',
    )
    const user = msgs[1].content
    expect(user).toContain('что значит быть настоящим другом')
    expect(user).toContain('Дружба')
    const sys = msgs[0].content
    expect(sys.toLowerCase()).toContain('один')
  })

  it('встраивает катящийся контекст, когда он передан', () => {
    const msgs = buildBlockMessages(
      skeletonInputT4,
      skeletonT4,
      skeletonT4.stages[0],
      { type: 'task', focus: 'игра' },
      [],
      'Уже раскрыто: вступление про дружбу',
    )
    expect(msgs[1].content).toContain('Уже раскрыто: вступление про дружбу')
  })

  it('инструктирует не выдумывать факты', () => {
    const msgs = buildBlockMessages(
      skeletonInputT4,
      skeletonT4,
      skeletonT4.stages[0],
      { type: 'discussion', focus: 'что значит быть настоящим другом' },
      [],
      '',
    )
    const sys = msgs[0].content
    expect(sys).toContain('НЕ выдумывай')
  })
})
