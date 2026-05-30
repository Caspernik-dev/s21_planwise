import { consumeToken, hashToken, invalidateUserTokens, issueToken } from '@/lib/auth/tokens'
import { describe, expect, it } from 'vitest'

type Row = {
  id: string
  userId: string
  kind: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

function makeStore() {
  const rows: Row[] = []
  return {
    rows,
    store: {
      insert: async (r: Omit<Row, 'id' | 'createdAt'>) => {
        rows.push({ id: crypto.randomUUID(), createdAt: new Date(), ...r })
      },
      findByHash: async (hash: string, kind: string) => {
        const r = rows.find((x) => x.tokenHash === hash && x.kind === kind)
        if (!r) return null
        return { id: r.id, userId: r.userId, expiresAt: r.expiresAt, usedAt: r.usedAt }
      },
      markUsed: async (id: string, at: Date) => {
        const r = rows.find((x) => x.id === id)
        if (r) r.usedAt = at
      },
      invalidate: async (userId: string, kind: string, at: Date) => {
        for (const r of rows) {
          if (r.userId === userId && r.kind === kind && r.usedAt === null) r.usedAt = at
        }
      },
      cleanup: async (_olderThan: Date) => {},
    },
  }
}

describe('hashToken', () => {
  it('детерминирован и не равен исходному', () => {
    const a = hashToken('abc')
    const b = hashToken('abc')
    expect(a).toBe(b)
    expect(a).not.toBe('abc')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('issueToken', () => {
  it('возвращает разные raw для одинаковых аргументов', async () => {
    const { store } = makeStore()
    const a = await issueToken('u1', 'verify', 3600, { store })
    const b = await issueToken('u1', 'verify', 3600, { store })
    expect(a.token).not.toBe(b.token)
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() - 1000)
  })

  it('сохраняет sha256 в БД, а не raw', async () => {
    const { rows, store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(rows[0]?.tokenHash).not.toBe(token)
  })
})

describe('consumeToken', () => {
  it('валидный токен → userId + помечен used', async () => {
    const { rows, store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    const r = await consumeToken(token, 'verify', { store })
    expect(r).toEqual({ userId: 'u1' })
    expect(rows[0]?.usedAt).not.toBeNull()
  })

  it('повторный consume того же токена → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    await consumeToken(token, 'verify', { store })
    const r2 = await consumeToken(token, 'verify', { store })
    expect(r2).toBeNull()
  })

  it('истёкший токен → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', -10, { store })
    const r = await consumeToken(token, 'verify', { store })
    expect(r).toBeNull()
  })

  it('чужой kind → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    const r = await consumeToken(token, 'reset', { store })
    expect(r).toBeNull()
  })

  it('несуществующий токен → null', async () => {
    const { store } = makeStore()
    const r = await consumeToken('not-a-token', 'verify', { store })
    expect(r).toBeNull()
  })
})

describe('invalidateUserTokens', () => {
  it('помечает все неиспользованные токены данного kind', async () => {
    const { rows, store } = makeStore()
    await issueToken('u1', 'verify', 3600, { store })
    await issueToken('u1', 'verify', 3600, { store })
    await issueToken('u1', 'reset', 3600, { store })
    await invalidateUserTokens('u1', 'verify', { store })
    const verify = rows.filter((r) => r.kind === 'verify')
    expect(verify.every((r) => r.usedAt !== null)).toBe(true)
    const reset = rows.filter((r) => r.kind === 'reset')
    expect(reset.every((r) => r.usedAt === null)).toBe(true)
  })
})
