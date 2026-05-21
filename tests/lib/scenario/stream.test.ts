import type { ScenarioContent } from '@/lib/scenario/schema'
import { streamScenario } from '@/lib/scenario/stream'
import { describe, expect, it, vi } from 'vitest'

const input = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 20,
  format: 'беседа' as const,
}

const SKELETON = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  stages: [
    { kind: 'engage', title: 'Старт', duration_min: 5 },
    { kind: 'main', title: 'Основа', duration_min: 10 },
    { kind: 'reflection', title: 'Итог', duration_min: 5 },
  ],
}

const FULL: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  materials: ['Доска'],
  stages: [
    {
      kind: 'engage',
      title: 'Старт',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Что такое дружба?' }],
    },
    {
      kind: 'main',
      title: 'Основа',
      duration_min: 10,
      activities: [{ type: 'game', text: 'Игра' }],
    },
    {
      kind: 'reflection',
      title: 'Итог',
      duration_min: 5,
      activities: [{ type: 'task', text: 'Итог' }],
    },
  ],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
}

function chunked(s: string, n = 20): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out
}

// Каркас идёт через chatStream; детали этапов — через chat (per-stage).
function makeChatStream() {
  return async function* chatStream() {
    for (const piece of chunked(JSON.stringify(SKELETON))) yield piece
  }
}

// chat возвращает активности одного этапа; берём их из FULL по счётчику вызовов.
function makeStageChat() {
  let i = 0
  return vi.fn(async () => {
    const stage = FULL.stages[Math.min(i, FULL.stages.length - 1)]
    i++
    return { content: JSON.stringify({ activities: stage.activities }), usage: null }
  })
}

describe('streamScenario', () => {
  it('эмитит фазы, skeleton, stage, saving и done', async () => {
    const save = vi.fn(async (_content: ScenarioContent, _meta: unknown) => 'scenario-123')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream(),
      chat: makeStageChat() as any,
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }

    const types = events.map((e) => e.type)
    expect(types).toContain('skeleton')
    expect(types).toContain('stage')
    expect(types.filter((t) => t === 'phase')).not.toHaveLength(0)
    const done = events.find((e) => e.type === 'done')
    expect(done).toEqual({ type: 'done', scenarioId: 'scenario-123' })

    expect(save).toHaveBeenCalledTimes(1)
    const [savedContent] = save.mock.calls[0]
    expect(savedContent.stages).toHaveLength(3)
    const total = savedContent.stages.reduce((s: number, st: any) => s + st.duration_min, 0)
    expect(total).toBe(20)
  })

  it('эмитит error при невалидном результате после repair', async () => {
    const badStream = async function* () {
      for (const p of chunked('не json вовсе')) yield p
    }
    const save = vi.fn(async () => 'x')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: (() => badStream()) as any,
      chat: async () => ({ content: 'всё ещё не json', usage: null }),
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })
})
