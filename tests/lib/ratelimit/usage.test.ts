import { describe, expect, it, vi } from 'vitest'
import { getDailyGenerationUsage } from '@/lib/ratelimit/usage'
import type { RateStore } from '@/lib/ratelimit'

const emptyStore: RateStore = {
  cleanup: vi.fn(async () => {}),
  current: vi.fn(async () => 0),
  increment: vi.fn(async () => {}),
}

const now = new Date('2026-05-30T15:30:00Z')

describe('getDailyGenerationUsage', () => {
  it('admin → unlimited', async () => {
    const res = await getDailyGenerationUsage('u1', 'a@x.ru', 'admin', {
      store: emptyStore, now, limit: 10,
    })
    expect(res).toEqual({ unlimited: true })
  })

  it('whitelist email → unlimited', async () => {
    const res = await getDailyGenerationUsage('u1', 'demo@kc.local', 'user', {
      store: emptyStore, now, limit: 10, demoEmails: 'demo@kc.local',
    })
    expect(res).toEqual({ unlimited: true })
  })

  it('нет записи → used=0, remaining=limit', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 0),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res).toEqual({
      unlimited: false,
      used: 0,
      limit: 10,
      remaining: 10,
      resetAt: new Date('2026-05-31T00:00:00Z'),
    })
  })

  it('used=7 → remaining=3', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 7),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res.unlimited).toBe(false)
    if (!res.unlimited) {
      expect(res.used).toBe(7)
      expect(res.remaining).toBe(3)
    }
  })

  it('used > limit → remaining=0 (не отрицательное)', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 99),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res.unlimited).toBe(false)
    if (!res.unlimited) expect(res.remaining).toBe(0)
  })

  it('читает по ключу "generate" (как в роуте)', async () => {
    const current = vi.fn(async () => 2)
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current,
      increment: vi.fn(async () => {}),
    }
    await getDailyGenerationUsage('u1', 'x@x.ru', 'user', { store, now, limit: 10 })
    expect(current).toHaveBeenCalledWith('generate', 'u1', new Date('2026-05-30T00:00:00Z'))
  })
})
