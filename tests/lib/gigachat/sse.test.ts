import { parseSSEBuffer } from '@/lib/gigachat/sse'
import { describe, expect, it } from 'vitest'

describe('parseSSEBuffer', () => {
  it('извлекает одно завершённое событие', () => {
    const { events, rest } = parseSSEBuffer('data: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('')
  })

  it('держит незавершённый хвост в rest', () => {
    const { events, rest } = parseSSEBuffer('data: {"a":1}\n\ndata: {"b":2')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b":2')
  })

  it('извлекает несколько событий за раз', () => {
    const { events } = parseSSEBuffer('data: x\n\ndata: y\n\n')
    expect(events).toEqual(['x', 'y'])
  })

  it('пробрасывает [DONE] как событие', () => {
    const { events } = parseSSEBuffer('data: [DONE]\n\n')
    expect(events).toEqual(['[DONE]'])
  })

  it('игнорирует строки без префикса data:', () => {
    const { events } = parseSSEBuffer('event: message\ndata: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
  })
})
