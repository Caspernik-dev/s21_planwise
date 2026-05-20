import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('calendar_events schema', () => {
  it('таблица существует', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.calendar_events') IS NOT NULL AS ok`)
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
})
