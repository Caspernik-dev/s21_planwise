import { auth } from '@/auth'
import { ScenarioSearch } from '@/components/dashboard/ScenarioSearch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { planTopics, scenarios, sharedScenarios, workPlans } from '@/db/schema'
import { DIRECTIONS, FORMATS, GRADES, formatGrade } from '@/lib/scenario/options'
import { and, count, desc, eq, ilike, isNotNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

type SearchParams = { q?: string; direction?: string; grade?: string; format?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const direction = DIRECTIONS.includes(sp.direction as never) ? sp.direction : undefined
  const gradeNum = Number(sp.grade)
  const grade = GRADES.includes(gradeNum as never) ? gradeNum : undefined
  const format = FORMATS.includes(sp.format as never) ? sp.format : undefined
  const hasQuery = Boolean(q || direction || grade !== undefined || format)

  const conds = [eq(scenarios.userId, userId)]
  if (q) conds.push(ilike(scenarios.title, `%${q}%`))
  if (direction) conds.push(eq(scenarios.direction, direction))
  if (grade !== undefined) conds.push(eq(scenarios.grade, grade))
  if (format) conds.push(eq(scenarios.format, format))

  const list = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      direction: scenarios.direction,
      grade: scenarios.grade,
      format: scenarios.format,
      createdAt: scenarios.createdAt,
    })
    .from(scenarios)
    .where(and(...conds))
    .orderBy(desc(scenarios.createdAt))
    .limit(100)

  const plans = await db
    .select({ id: workPlans.id, title: workPlans.title })
    .from(workPlans)
    .where(eq(workPlans.userId, userId))
    .orderBy(desc(workPlans.createdAt))
    .limit(3)

  const topicRows = await db
    .select({ id: planTopics.id, workPlanId: planTopics.workPlanId })
    .from(planTopics)
    .where(eq(planTopics.userId, userId))

  const scenarioTopicRows = await db
    .select({ id: scenarios.id, topicId: scenarios.sourcePlanTopicId })
    .from(scenarios)
    .where(and(eq(scenarios.userId, userId), isNotNull(scenarios.sourcePlanTopicId)))
  const scenarioByTopic = new Map<string, string>()
  for (const r of scenarioTopicRows) {
    if (r.topicId && !scenarioByTopic.has(r.topicId)) scenarioByTopic.set(r.topicId, r.id)
  }

  const planStats = plans.map((p) => {
    const ts = topicRows.filter((t) => t.workPlanId === p.id)
    return {
      ...p,
      total: ts.length,
      done: ts.filter((t) => scenarioByTopic.has(t.id)).length,
    }
  })

  const [sharedCountRow] = await db.select({ value: count() }).from(sharedScenarios)
  const sharedCount = sharedCountRow?.value ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">Мои сценарии</h1>
        <Button asChild>
          <Link href="/app/new">Создать сценарий</Link>
        </Button>
      </div>

      {planStats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {planStats.map((p) => (
            <Link key={p.id} href={`/app/plans/${p.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-neutral-600">
                  Закрыто {p.done}/{p.total} тем
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Link href="/app/library" className="block">
        <Card className="transition hover:shadow-hover">
          <CardHeader>
            <CardTitle className="text-base">Библиотека сообщества</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">{sharedCount} сценариев</CardContent>
        </Card>
      </Link>

      <ScenarioSearch />

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{hasQuery ? 'Ничего не найдено' : 'Пока пусто'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            {hasQuery
              ? 'Попробуйте изменить запрос или сбросить фильтры.'
              : 'Создайте первый сценарий — укажите направление, класс, тему, длительность и формат.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((s) => (
            <Link key={s.id} href={`/app/scenarios/${s.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  {[s.direction, formatGrade(s.grade), s.format].map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600"
                    >
                      {b}
                    </span>
                  ))}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
