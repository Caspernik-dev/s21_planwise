import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('plans schema', () => {
  it('таблицы work_plans и plan_topics существуют', async () => {
    const r = await db.execute(
      sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('work_plans','plan_topics')`,
    )
    expect((r[0] as { n: number }).n).toBe(2)
  })
})
