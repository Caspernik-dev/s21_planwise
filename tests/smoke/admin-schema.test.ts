import { db } from '@/db'
import { generationStats } from '@/lib/admin/stats'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('admin schema', () => {
  it('таблица events существует', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.events') IS NOT NULL AS ok`)
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
  it('колонка users.role существует', async () => {
    const r = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='role'
      ) AS ok`)
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
  it('generationStats возвращает числа и массив byDay', async () => {
    const s = await generationStats(db)
    expect(typeof s.total).toBe('number')
    expect(Array.isArray(s.byDay)).toBe(true)
  })
})
