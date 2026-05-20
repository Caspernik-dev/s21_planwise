import { isWhitelisted, windowStartFor } from '@/lib/ratelimit/window'
import { describe, expect, it } from 'vitest'

describe('windowStartFor', () => {
  it('округляет вниз до начала окна', () => {
    const now = new Date('2026-05-20T13:37:42.000Z')
    const ws = windowStartFor(now, 15 * 60 * 1000)
    expect(ws.toISOString()).toBe('2026-05-20T13:30:00.000Z')
  })
  it('суточное окно начинается в полночь UTC', () => {
    const now = new Date('2026-05-20T13:37:42.000Z')
    const ws = windowStartFor(now, 86_400_000)
    expect(ws.toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })
})

describe('isWhitelisted', () => {
  it('матчит без учёта регистра и пробелов', () => {
    expect(isWhitelisted('Demo@x.ru', ' demo@x.ru , a@b.ru ')).toBe(true)
  })
  it('false для пустого email или пустого списка', () => {
    expect(isWhitelisted(null, 'a@b.ru')).toBe(false)
    expect(isWhitelisted('a@b.ru', '')).toBe(false)
    expect(isWhitelisted('a@b.ru', undefined)).toBe(false)
  })
})
