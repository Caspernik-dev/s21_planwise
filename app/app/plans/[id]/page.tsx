import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/db'
import { planTopics, scenarios, workPlans } from '@/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { id } = await params

  const [plan] = await db
    .select()
    .from(workPlans)
    .where(and(eq(workPlans.id, id), eq(workPlans.userId, userId)))
    .limit(1)
  if (!plan) notFound()

  const topics = await db
    .select()
    .from(planTopics)
    .where(and(eq(planTopics.workPlanId, id), eq(planTopics.userId, userId)))
    .orderBy(asc(planTopics.orderIdx))

  const topicIds = topics.map((t) => t.id)
  const coveredRows = topicIds.length
    ? await db
        .select({ topicId: scenarios.sourcePlanTopicId, scenarioId: scenarios.id })
        .from(scenarios)
        .where(and(eq(scenarios.userId, userId), inArray(scenarios.sourcePlanTopicId, topicIds)))
    : []
  const coveredBy = new Map(coveredRows.map((r) => [r.topicId as string, r.scenarioId]))

  const done = topics.filter((t) => coveredBy.has(t.id)).length

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/plans" className="text-sm text-brand-600 hover:underline">
          ← Все планы
        </Link>
        <h1 className="mt-1 text-3xl font-semibold text-neutral-900">{plan.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Закрыто {done}/{topics.length} тем
        </p>
      </div>

      <div className="space-y-2">
        {topics.map((t) => {
          const scenarioId = coveredBy.get(t.id)
          const href = scenarioId
            ? `/app/scenarios/${scenarioId}`
            : `/app/new?type=rov&topic=${encodeURIComponent(t.title)}&planTopicId=${t.id}`
          return (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{t.title}</p>
                  {t.plannedDate && <p className="text-xs text-neutral-500">{t.plannedDate}</p>}
                </div>
                {scenarioId ? (
                  <Link
                    href={href}
                    className="shrink-0 rounded-full bg-accent-50 px-2.5 py-1 text-xs text-accent-700 hover:bg-accent-100"
                  >
                    ✓ готов
                  </Link>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href={href}>Сгенерировать</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
