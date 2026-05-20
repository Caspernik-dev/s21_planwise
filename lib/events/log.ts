import { db as realDb } from '@/db'
import { events } from '@/db/schema'

export type EventType = 'export' | 'login' | 'search'
type Db = typeof realDb

export async function logEvent(
  type: EventType,
  opts: { userId?: string | null; meta?: Record<string, unknown> } = {},
  db: Db = realDb,
): Promise<void> {
  try {
    await db.insert(events).values({
      type,
      userId: opts.userId ?? null,
      meta: opts.meta ?? null,
    })
  } catch (e) {
    console.error('logEvent failed (non-fatal):', e)
  }
}
