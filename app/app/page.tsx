import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { planTopics, scenarios, sharedScenarios, workPlans } from '@/db/schema'
import { and, count, desc, eq, isNotNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const recent = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      direction: scenarios.direction,
      grade: scenarios.grade,
      format: scenarios.format,
      createdAt: scenarios.createdAt,
    })
    .from(scenarios)
    .where(eq(scenarios.userId, session.user.id))
    .orderBy(desc(scenarios.createdAt))
    .limit(10)

  const plans = await db
    .select({ id: workPlans.id, title: workPlans.title })
    .from(workPlans)
    .where(eq(workPlans.userId, session.user.id))
    .orderBy(desc(workPlans.createdAt))
    .limit(3)

  const topicRows = await db
    .select({ id: planTopics.id, workPlanId: planTopics.workPlanId })
    .from(planTopics)
    .where(eq(planTopics.userId, session.user.id))
  const coveredIds = new Set(
    (
      await db
        .select({ t: scenarios.sourcePlanTopicId })
        .from(scenarios)
        .where(and(eq(scenarios.userId, session.user.id), isNotNull(scenarios.sourcePlanTopicId)))
    )
      .map((r) => r.t)
      .filter((x): x is string => !!x),
  )
  const planStats = plans.map((p) => {
    const ts = topicRows.filter((t) => t.workPlanId === p.id)
    return { ...p, total: ts.length, done: ts.filter((t) => coveredIds.has(t.id)).length }
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

      <Link href="/app/library">
        <Card className="transition hover:shadow-hover">
          <CardHeader>
            <CardTitle className="text-base">Библиотека сообщества</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">{sharedCount} сценариев</CardContent>
        </Card>
      </Link>

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

      {recent.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Пока пусто</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            Создайте первый сценарий — укажите направление, класс, тему, длительность и формат.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recent.map((s) => (
            <Link key={s.id} href={`/app/scenarios/${s.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  {[s.direction, `${s.grade} класс`, s.format].map((b) => (
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
