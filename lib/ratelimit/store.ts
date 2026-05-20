import { db } from '@/db'
import { rateBuckets } from '@/db/schema'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { RateStore } from './index'

export const dbStore: RateStore = {
  async cleanup(subject, olderThan) {
    await db
      .delete(rateBuckets)
      .where(and(eq(rateBuckets.subject, subject), lt(rateBuckets.windowStart, olderThan)))
  },
  async current(key, subject, windowStart) {
    const [row] = await db
      .select({ count: rateBuckets.count })
      .from(rateBuckets)
      .where(
        and(
          eq(rateBuckets.key, key),
          eq(rateBuckets.subject, subject),
          eq(rateBuckets.windowStart, windowStart),
        ),
      )
      .limit(1)
    return row?.count ?? 0
  },
  async increment(key, subject, windowStart) {
    await db
      .insert(rateBuckets)
      .values({ key, subject, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateBuckets.key, rateBuckets.subject, rateBuckets.windowStart],
        set: { count: sql`${rateBuckets.count} + 1` },
      })
  },
}
