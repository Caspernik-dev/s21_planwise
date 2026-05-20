import { generateScenario } from '@/lib/scenario/generate'
import type { GenerationInput } from '@/lib/scenario/schema'
import { describe, expect, it, vi } from 'vitest'

const input: GenerationInput = {
  direction: 'Патриотическое',
  grade: 6,
  topic: 'День Победы',
  durationMin: 30,
  format: 'классный час',
}

const validJson = JSON.stringify({
  title: 'День Победы',
  goals: ['Воспитание уважения к подвигу народа'],
  materials: ['Проектор'],
  stages: [
    {
      kind: 'engage',
      title: 'Вступление',
      duration_min: 10,
      activities: [{ type: 'discussion', text: 'Что вы знаете о войне?' }],
    },
    {
      kind: 'main',
      title: 'Основная часть',
      duration_min: 40,
      activities: [{ type: 'task', text: 'Письмо ветерану' }],
    },
    {
      kind: 'reflection',
      title: 'Итог',
      duration_min: 10,
      activities: [{ type: 'discussion', text: 'Что запомнилось?' }],
    },
  ],
  adaptations: { simpler: 'Меньше дат', harder: 'Доклад' },
})

describe('generateScenario', () => {
  it('parses JSON wrapped in markdown fences and normalizes chronometry', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: ['```json', validJson, '```'].join('\n'),
      usage: { promptTokens: 100, completionTokens: 200 },
    })
    const { content, meta } = await generateScenario(input, { chat })
    expect(content.title).toBe('День Победы')
    expect(content.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(30)
    expect(meta.normalized).toBe(true)
    expect(meta.repaired).toBe(false)
    expect(meta.usage).toEqual({ promptTokens: 100, completionTokens: 200 })
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('runs a single repair pass when first response is invalid JSON', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: 'это не json вообще', usage: null })
      .mockResolvedValueOnce({
        content: validJson,
        usage: { promptTokens: 50, completionTokens: 60 },
      })
    const { content, meta } = await generateScenario(input, { chat })
    expect(content.title).toBe('День Победы')
    expect(meta.repaired).toBe(true)
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('throws when repair also fails', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'мусор', usage: null })
    await expect(generateScenario(input, { chat })).rejects.toThrow(/валидн/i)
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('throws when schema validation fails even with valid JSON', async () => {
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ title: 'x' }), usage: null })
    await expect(generateScenario(input, { chat })).rejects.toThrow()
    expect(chat).toHaveBeenCalledTimes(2)
  })
})
