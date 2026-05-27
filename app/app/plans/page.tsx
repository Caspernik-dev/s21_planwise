import { auth } from '@/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { planTopics, scenarios, workPlans } from '@/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UploadPlanForm } from './upload-form'

export default async function PlansPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const plans = await db
    .select()
    .from(workPlans)
    .where(eq(workPlans.userId, userId))
    .orderBy(desc(workPlans.createdAt))

  const topics = await db
    .select({ id: planTopics.id, workPlanId: planTopics.workPlanId })
    .from(planTopics)
    .where(eq(planTopics.userId, userId))

  const covered = new Set(
    (
      await db
        .select({ topicId: scenarios.sourcePlanTopicId })
        .from(scenarios)
        .where(and(eq(scenarios.userId, userId), isNotNull(scenarios.sourcePlanTopicId)))
    )
      .map((r) => r.topicId)
      .filter((x): x is string => !!x),
  )

  const stats = new Map<string, { total: number; done: number }>()
  for (const t of topics) {
    const s = stats.get(t.workPlanId) ?? { total: 0, done: 0 }
    s.total += 1
    if (covered.has(t.id)) s.done += 1
    stats.set(t.workPlanId, s)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-neutral-900">Планы воспитательной работы</h1>
      <UploadPlanForm />

      {plans.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-neutral-600">
            Загрузите план (PDF, DOCX, PPTX или TXT) — мы обезличим персональные данные и разложим
            его на темы.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((p) => {
            const s = stats.get(p.id) ?? { total: 0, done: 0 }
            return (
              <Link key={p.id} href={`/app/plans/${p.id}`}>
                <Card className="h-full transition hover:shadow-hover">
                  <CardHeader>
                    <CardTitle className="text-lg">{p.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-neutral-600">
                    Закрыто {s.done}/{s.total} тем
                    {p.anonymized ? (
                      <span className="ml-2 rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
                        обезличен
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-error/10 px-2 py-0.5 text-xs text-error">
                        без обезличивания
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
