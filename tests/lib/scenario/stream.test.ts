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

// Каркас с контент-планом: 3 этапа, по 1 блоку → всего 3 блока.
const SKELETON = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  materials: ['Доска'],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
  stages: [
    {
      kind: 'engage',
      title: 'Старт',
      duration_min: 5,
      blocks: [{ type: 'discussion', focus: 'старт' }],
    },
    { kind: 'main', title: 'Основа', duration_min: 10, blocks: [{ type: 'game', focus: 'игра' }] },
    {
      kind: 'reflection',
      title: 'Итог',
      duration_min: 5,
      blocks: [{ type: 'task', focus: 'итог' }],
    },
  ],
}

// Плотный блок, проходящий гейт (≥600 симв., ≥2 реплики «Учитель:»).
const denseText = `${'Учитель: содержательная реплика по теме дружбы с примерами и фактами. '.repeat(12)}`
const BLOCK = JSON.stringify({
  type: 'discussion',
  text: denseText,
  questions: [
    'Что для тебя значит это?',
    'Почему это важно сегодня?',
    'Как ты поступишь в такой ситуации?',
  ],
})

function chunked(s: string, n = 20): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out
}

function makeChatStream() {
  return async function* () {
    for (const piece of chunked(JSON.stringify(SKELETON))) yield piece
  }
}

describe('streamScenario (per-block)', () => {
  it('эмитит phase, skeleton, block×N, saving и done', async () => {
    const save = vi.fn(async (_c: ScenarioContent, _m: unknown) => 'scenario-123')
    const chat = vi.fn(async () => ({ content: BLOCK, usage: null }))
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream() as any,
      chat: chat as any,
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }

    const types = events.map((e) => e.type)
    expect(types).toContain('skeleton')
    expect(types.filter((t) => t === 'block')).toHaveLength(3)
    const blockEv = events.find((e) => e.type === 'block')
    expect(blockEv).toMatchObject({ type: 'block', total: 3 })
    expect(events.find((e) => e.type === 'done')).toEqual({
      type: 'done',
      scenarioId: 'scenario-123',
    })

    expect(save).toHaveBeenCalledTimes(1)
    const [savedContent] = save.mock.calls[0]
    expect(savedContent.stages).toHaveLength(3)
    expect(savedContent.stages.every((s: any) => s.activities.length >= 1)).toBe(true)
  })

  it('перегенерирует тонкий блок (гейт), затем принимает плотный', async () => {
    const thin = JSON.stringify({ type: 'task', text: 'коротко' })
    const calls: string[] = []
    let firstBlockTries = 0
    const chat = vi.fn(async () => {
      if (firstBlockTries === 0) {
        firstBlockTries++
        calls.push('thin')
        return { content: thin, usage: null }
      }
      calls.push('dense')
      return { content: BLOCK, usage: null }
    })
    const save = vi.fn(async () => 'x')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream() as any,
      chat: chat as any,
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }
    expect(calls[0]).toBe('thin')
    expect(chat.mock.calls.length).toBeGreaterThan(3) // 3 блока + ≥1 ретрай
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('эмитит error при невалидном каркасе', async () => {
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
