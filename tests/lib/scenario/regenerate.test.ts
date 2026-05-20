import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { buildActivityMessages, regenerateActivity } from '@/lib/scenario/regenerate'
import { describe, expect, it, vi } from 'vitest'

const args = {
  scenario: {
    direction: 'Гражданское',
    grade: 5,
    topic: 'Дружба',
    format: 'классный час',
    title: 'О дружбе',
  },
  stage: { kind: 'main' as const, title: 'Основная часть' },
  current: { type: 'discussion' as const, text: 'старый вопрос' },
}

function chatReturning(content: string) {
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => ({ content, usage: null }))
}

describe('buildActivityMessages', () => {
  it('включает тему, этап и текущую активность', () => {
    const msgs = buildActivityMessages(args, [])
    const joined = msgs.map((m) => m.content).join('\n')
    expect(joined).toContain('Дружба')
    expect(joined).toContain('Основная часть')
    expect(joined).toContain('старый вопрос')
  })
  it('включает RAG-фрагменты, если переданы', () => {
    const msgs = buildActivityMessages(args, [
      { text: 'методичка про дружбу', documentTitle: 'Док', sectionKind: 'main' },
    ])
    expect(msgs.map((m) => m.content).join('\n')).toContain('методичка про дружбу')
  })
})

describe('regenerateActivity', () => {
  it('парсит валидную активность из JSON', async () => {
    const chat = chatReturning(
      JSON.stringify({ type: 'game', text: 'новая игра', questions: ['Q1?'] }),
    )
    const result = await regenerateActivity(args, { chat })
    expect(result).toEqual({ type: 'game', text: 'новая игра', questions: ['Q1?'] })
    expect(chat).toHaveBeenCalledTimes(1)
  })
  it('извлекает JSON из markdown-fence', async () => {
    const chat = chatReturning('```json\n{"type":"task","text":"задача"}\n```')
    const result = await regenerateActivity(args, { chat })
    expect(result.type).toBe('task')
  })
  it('делает repair-pass при невалидном первом ответе', async () => {
    const chat = vi
      .fn<(m: GigaMessage[]) => Promise<ChatResult>>()
      .mockResolvedValueOnce({ content: 'не json', usage: null })
      .mockResolvedValueOnce({ content: '{"type":"quiz","text":"квиз"}', usage: null })
    const result = await regenerateActivity(args, { chat })
    expect(result.text).toBe('квиз')
    expect(chat).toHaveBeenCalledTimes(2)
  })
  it('бросает ошибку, если и repair невалиден', async () => {
    const chat = chatReturning('мусор')
    await expect(regenerateActivity(args, { chat })).rejects.toThrow()
  })
})
