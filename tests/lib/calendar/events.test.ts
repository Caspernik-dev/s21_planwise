import { bindScenarioToDate, listUserEvents } from '@/lib/calendar/events'
import { describe, expect, it } from 'vitest'

function fakeDb() {
  const calls: { op: string; values?: unknown; where?: unknown }[] = []
  return {
    calls,
    insert() {
      return {
        values(v: unknown) {
          calls.push({ op: 'insert', values: v })
          return { returning: async () => [{ id: 'evt1' }] }
        },
      }
    },
    select() {
      return {
        from() {
          return {
            where(w: unknown) {
              calls.push({ op: 'select', where: w })
              return { orderBy: async () => [] }
            },
          }
        },
      }
    },
    delete() {
      return {
        where(w: unknown) {
          calls.push({ op: 'delete', where: w })
          return Promise.resolve()
        },
      }
    },
  }
}

describe('calendar events data-access', () => {
  it('bindScenarioToDate вставляет с userId/scenarioId/date', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    const id = await bindScenarioToDate(db as any, {
      userId: 'u1',
      scenarioId: 's1',
      eventDate: '2026-05-09',
      title: 'День Победы',
    })
    expect(id).toBe('evt1')
    const ins = db.calls.find((c) => c.op === 'insert')
    expect(ins?.values).toMatchObject({ userId: 'u1', scenarioId: 's1', eventDate: '2026-05-09' })
  })

  it('listUserEvents всегда фильтрует по userId (where передан)', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await listUserEvents(db as any, 'u1')
    const sel = db.calls.find((c) => c.op === 'select')
    expect(sel?.where).toBeDefined()
  })
})
