import type { GigaMessage } from '@/lib/gigachat/types'
import { generateValidated } from '@/lib/scenario/llm-retry'
import { describe, expect, it, vi } from 'vitest'

const base: GigaMessage[] = [{ role: 'user', content: 'дай JSON' }]
const parseOk = (raw: string) => (raw === 'GOOD' ? { ok: true } : null)

describe('generateValidated', () => {
  it('успех с первой попытки — один вызов chat', async () => {
    const chat = vi.fn(async () => ({ content: 'GOOD', usage: null }))
    const r = await generateValidated(chat, base, parseOk)
    expect(chat).toHaveBeenCalledTimes(1)
    expect(r?.value).toEqual({ ok: true })
    expect(r?.attempts).toBe(1)
  })

  it('повторяет после невалидных ответов и возвращает результат', async () => {
    let n = 0
    const chat = vi.fn(async () => ({ content: n++ < 2 ? 'BAD' : 'GOOD', usage: null }))
    const r = await generateValidated(chat, base, parseOk, { attempts: 3 })
    expect(chat).toHaveBeenCalledTimes(3)
    expect(r?.value).toEqual({ ok: true })
    expect(r?.attempts).toBe(3)
  })

  it('возвращает null, если все попытки невалидны', async () => {
    const chat = vi.fn(async () => ({ content: 'BAD', usage: null }))
    const r = await generateValidated(chat, base, parseOk, { attempts: 2 })
    expect(chat).toHaveBeenCalledTimes(2)
    expect(r).toBeNull()
  })

  it('после неудачи добавляет корректирующее сообщение в диалог', async () => {
    let secondCallMessages: GigaMessage[] = []
    let n = 0
    const chat = vi.fn(async (msgs: GigaMessage[]) => {
      if (n === 1) secondCallMessages = msgs
      n++
      return { content: n < 2 ? 'BAD' : 'GOOD', usage: null }
    })
    await generateValidated(chat, base, parseOk, { attempts: 2, corrective: 'ИСПРАВЬ' })
    expect(secondCallMessages.at(-1)).toEqual({ role: 'user', content: 'ИСПРАВЬ' })
    expect(secondCallMessages.some((m) => m.role === 'assistant' && m.content === 'BAD')).toBe(true)
  })
})
