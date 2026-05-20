import { logEvent } from '@/lib/events/log'
import { describe, expect, it } from 'vitest'

function fakeDb() {
  const calls: unknown[] = []
  return {
    calls,
    insert() {
      return {
        values(v: unknown) {
          calls.push(v)
          return Promise.resolve()
        },
      }
    },
  }
}

describe('logEvent', () => {
  it('вставляет событие с type/userId/meta', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await logEvent('export', { userId: 'u1', meta: { format: 'pdf' } }, db as any)
    expect(db.calls[0]).toMatchObject({ type: 'export', userId: 'u1', meta: { format: 'pdf' } })
  })
  it('не бросает при сбое БД (best-effort)', async () => {
    const throwing = {
      insert() {
        throw new Error('db down')
      },
    }
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await expect(logEvent('login', { userId: 'u1' }, throwing as any)).resolves.toBeUndefined()
  })
})
