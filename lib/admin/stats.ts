import { db as realDb } from '@/db'
import { sql } from 'drizzle-orm'

type Db = typeof realDb
type Row = Record<string, unknown>
const rows = (r: unknown) => r as unknown as Row[]

export type GenerationStats = {
  total: number
  ok: number
  error: number
  avgLatencyFullMs: number | null
  avgLatencyRegenMs: number | null
  byDay: Array<{ day: string; count: number }>
}
export async function generationStats(db: Db = realDb): Promise<GenerationStats> {
  const [agg] = rows(
    await db.execute(sql`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE status='ok') AS ok,
        count(*) FILTER (WHERE status='error') AS error,
        round(avg(latency_ms) FILTER (WHERE kind='full')) AS avg_latency_full,
        round(avg(latency_ms) FILTER (WHERE kind='regen')) AS avg_latency_regen
      FROM generations`),
  )
  const day = rows(
    await db.execute(sql`
      SELECT to_char(date(created_at),'YYYY-MM-DD') AS day, count(*) AS count
      FROM generations
      WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day`),
  )
  return {
    total: Number(agg?.total ?? 0),
    ok: Number(agg?.ok ?? 0),
    error: Number(agg?.error ?? 0),
    avgLatencyFullMs: agg?.avg_latency_full == null ? null : Number(agg.avg_latency_full),
    avgLatencyRegenMs: agg?.avg_latency_regen == null ? null : Number(agg.avg_latency_regen),
    byDay: day.map((r) => ({ day: String(r.day), count: Number(r.count) })),
  }
}

export type KeyCount = { key: string; count: number }
export type ContentStats = {
  topTopics: KeyCount[]
  byDirection: KeyCount[]
  byGrade: KeyCount[]
  byFormat: KeyCount[]
  byDuration: KeyCount[]
}
async function groupCount(db: Db, col: string): Promise<KeyCount[]> {
  // col — доверенный литерал имени колонки (не пользовательский ввод)
  const r = rows(
    await db.execute(
      sql`SELECT ${sql.raw(col)}::text AS key, count(*) AS count
          FROM scenarios GROUP BY ${sql.raw(col)} ORDER BY count DESC`,
    ),
  )
  return r.map((x) => ({ key: String(x.key), count: Number(x.count) }))
}
export async function contentStats(db: Db = realDb): Promise<ContentStats> {
  const topTopics = rows(
    await db.execute(sql`
      SELECT topic AS key, count(*) AS count
      FROM scenarios GROUP BY topic ORDER BY count DESC LIMIT 10`),
  ).map((x) => ({ key: String(x.key), count: Number(x.count) }))
  return {
    topTopics,
    byDirection: await groupCount(db, 'direction'),
    byGrade: await groupCount(db, 'grade'),
    byFormat: await groupCount(db, 'format'),
    byDuration: await groupCount(db, 'duration_min'),
  }
}

export type UserStats = {
  totalUsers: number
  activeUsers: number
  newByDay: Array<{ day: string; count: number }>
  topUsers: Array<{ email: string; count: number }>
}
export async function userStats(db: Db = realDb): Promise<UserStats> {
  const [tot] = rows(await db.execute(sql`SELECT count(*) AS c FROM users`))
  const [act] = rows(
    await db.execute(sql`
      SELECT count(DISTINCT user_id) AS c FROM generations
      WHERE created_at >= now() - interval '30 days'`),
  )
  const newByDay = rows(
    await db.execute(sql`
      SELECT to_char(date(created_at),'YYYY-MM-DD') AS day, count(*) AS count
      FROM users WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day`),
  ).map((r) => ({ day: String(r.day), count: Number(r.count) }))
  const topUsers = rows(
    await db.execute(sql`
      SELECT u.email AS email, count(*) AS count
      FROM generations g JOIN users u ON u.id = g.user_id
      GROUP BY u.email ORDER BY count DESC LIMIT 10`),
  ).map((r) => ({ email: String(r.email), count: Number(r.count) }))
  return {
    totalUsers: Number(tot?.c ?? 0),
    activeUsers: Number(act?.c ?? 0),
    newByDay,
    topUsers,
  }
}

export type CommunityStats = {
  totalLikes: number
  totalShared: number
  topShared: Array<{ topic: string; likeCount: number }>
  planCoverage: { closed: number; total: number }
}
export async function communityStats(db: Db = realDb): Promise<CommunityStats> {
  const [likes] = rows(await db.execute(sql`SELECT count(*) AS c FROM likes`))
  const [shared] = rows(await db.execute(sql`SELECT count(*) AS c FROM shared_scenarios`))
  const topShared = rows(
    await db.execute(sql`
      SELECT topic, like_count AS "likeCount"
      FROM shared_scenarios ORDER BY like_count DESC LIMIT 10`),
  ).map((r) => ({ topic: String(r.topic), likeCount: Number(r.likeCount) }))
  const [cov] = rows(
    await db.execute(sql`
      SELECT
        (SELECT count(DISTINCT source_plan_topic_id) FROM scenarios
         WHERE source_plan_topic_id IS NOT NULL) AS closed,
        (SELECT count(*) FROM plan_topics) AS total`),
  )
  return {
    totalLikes: Number(likes?.c ?? 0),
    totalShared: Number(shared?.c ?? 0),
    topShared,
    planCoverage: { closed: Number(cov?.closed ?? 0), total: Number(cov?.total ?? 0) },
  }
}

export type EventStats = {
  byType: KeyCount[]
  topSearches: KeyCount[]
  exportFormats: KeyCount[]
}
export async function eventStats(db: Db = realDb): Promise<EventStats> {
  const byType = rows(
    await db.execute(sql`
      SELECT type AS key, count(*) AS count FROM events
      WHERE created_at >= now() - interval '30 days'
      GROUP BY type ORDER BY count DESC`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  const topSearches = rows(
    await db.execute(sql`
      SELECT meta->>'query' AS key, count(*) AS count FROM events
      WHERE type='search' AND meta->>'query' IS NOT NULL
      GROUP BY key ORDER BY count DESC LIMIT 10`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  const exportFormats = rows(
    await db.execute(sql`
      SELECT meta->>'format' AS key, count(*) AS count FROM events
      WHERE type='export' AND meta->>'format' IS NOT NULL
      GROUP BY key ORDER BY count DESC`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  return { byType, topSearches, exportFormats }
}
