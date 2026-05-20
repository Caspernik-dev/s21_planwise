import type { RateStore } from '@/lib/ratelimit'
import { checkRateLimit } from '@/lib/ratelimit'
import { describe, expect, it } from 'vitest'

function memStore(): RateStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>()
  const k = (key: string, subject: string, ws: Date) => `${key}|${subject}|${ws.toISOString()}`
  return {
    rows,
    async cleanup() {},
    async current(key, subject, ws) {
      return rows.get(k(key, subject, ws)) ?? 0
    },
    async increment(key, subject, ws) {
      rows.set(k(key, subject, ws), (rows.get(k(key, subject, ws)) ?? 0) + 1)
    },
  }
}

const now = new Date('2026-05-20T10:00:00.000Z')

describe('checkRateLimit', () => {
  it('пропускает под лимитом и инкрементит', async () => {
    const store = memStore()
    const r = await checkRateLimit(
      { key: 'gen', subject: 'u1', limit: 2, windowMs: 86_400_000 },
      { store, now },
    )
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(1)
    expect(store.rows.size).toBe(1)
  })

  it('блокирует на лимите и считает retryAfter', async () => {
    const store = memStore()
    const c = { key: 'gen', subject: 'u1', limit: 1, windowMs: 86_400_000 }
    await checkRateLimit(c, { store, now })
    const r = await checkRateLimit(c, { store, now })
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it('whitelist байпасит лимит без инкремента', async () => {
    const store = memStore()
    const r = await checkRateLimit(
      { key: 'gen', subject: 'u1', limit: 0, windowMs: 86_400_000, email: 'demo@x.ru' },
      { store, now, demoEmails: 'demo@x.ru' },
    )
    expect(r.allowed).toBe(true)
    expect(store.rows.size).toBe(0)
  })
})
