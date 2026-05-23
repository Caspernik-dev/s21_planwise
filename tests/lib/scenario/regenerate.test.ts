import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import type { ScenarioSkeleton } from '@/lib/scenario/schema'
import { describe, expect, it, vi } from 'vitest'

const input = {
  direction: 'Гражданское' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа' as const,
}

const skeleton: ScenarioSkeleton = {
  title: 'О дружбе',
  goals: ['ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  stages: [{ kind: 'engage', title: 'Вступление', duration_min: 5 }],
}

const dense = `${'Учитель: содержательная вводная реплика про дружбу с примером. '.repeat(12)}`

function chatReturning(content: string) {
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => ({ content, usage: null }))
}

describe('regenerateActivity', () => {
  it('использует роль этапа в промпте и возвращает блок', async () => {
    const chat = chatReturning(
      JSON.stringify({ type: 'discussion', text: dense, questions: ['а?', 'б?', 'в?'] }),
    )
    const activity = await regenerateActivity(
      {
        input,
        skeleton,
        stage: { kind: 'engage', title: 'Вступление', duration_min: 5 },
        targetType: 'discussion',
        runningContext: '',
      },
      { chat },
    )
    expect(activity.text).toContain('Учитель:')
    const sentSystem = (chat.mock.calls[0][0] as GigaMessage[])[0].content
    expect(sentSystem).toContain('мотивационно-целевой')
  })

  it('форсит выбранный тип, даже если модель вернула другой', async () => {
    const chat = chatReturning(
      JSON.stringify({ type: 'game', text: dense, questions: ['а?', 'б?', 'в?'] }),
    )
    const activity = await regenerateActivity(
      {
        input,
        skeleton,
        stage: { kind: 'engage', title: 'Вступление', duration_min: 5 },
        targetType: 'discussion',
        runningContext: '',
      },
      { chat },
    )
    expect(activity.type).toBe('discussion')
  })

  it('бросает ошибку, если блок невалиден', async () => {
    const chat = chatReturning('не json вовсе')
    await expect(
      regenerateActivity(
        {
          input,
          skeleton,
          stage: { kind: 'main', title: 'Основа', duration_min: 10 },
          targetType: 'task',
          runningContext: '',
        },
        { chat },
      ),
    ).rejects.toThrow()
  })
})
