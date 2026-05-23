import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { generateBlockWithGate, parseBlock } from '@/lib/scenario/block-gen'
import { describe, expect, it, vi } from 'vitest'

const dense = `${'Учитель: содержательная реплика по теме с примером и фактом. '.repeat(12)}`
const DENSE_BLOCK = JSON.stringify({
  type: 'discussion',
  text: dense,
  questions: ['а?', 'б?', 'в?'],
})
const THIN_BLOCK = JSON.stringify({ type: 'task', text: 'коротко' })

const chatOf = (...contents: string[]) => {
  let i = 0
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => {
    const c = contents[Math.min(i, contents.length - 1)]
    i++
    return { content: c, usage: null }
  })
}

describe('parseBlock', () => {
  it('парсит и коэрсит тип', () => {
    const a = parseBlock(JSON.stringify({ type: 'debate', text: 'x' }))
    expect(a?.type).toBe('discussion')
  })
  it('null на мусоре', () => {
    expect(parseBlock('не json')).toBeNull()
  })
})

describe('generateBlockWithGate', () => {
  it('принимает плотный блок с первого раза', async () => {
    const chat = chatOf(DENSE_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main')
    expect(r?.accepted).toBe(true)
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('перегенерирует тонкий блок, затем принимает плотный', async () => {
    const chat = chatOf(THIN_BLOCK, DENSE_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 2 })
    expect(r?.accepted).toBe(true)
    expect(chat.mock.calls.length).toBeGreaterThan(1)
  })

  it('исчерпав ретраи, возвращает лучший с accepted=false', async () => {
    const chat = chatOf(THIN_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 1 })
    expect(r?.accepted).toBe(false)
    expect(r?.value.text).toBe('коротко')
  })

  it('null если все ответы невалидны', async () => {
    const chat = chatOf('не json вовсе')
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 1 })
    expect(r).toBeNull()
  })
})
