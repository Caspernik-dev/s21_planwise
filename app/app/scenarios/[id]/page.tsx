import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

const KIND_LABEL: Record<string, string> = {
  engage: 'Вовлечение',
  main: 'Основная часть',
  reflection: 'Рефлексия',
}

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { id } = await params

  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.userId, session.user.id)))
    .limit(1)

  if (!scenario) notFound()
  const content = scenario.content

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900">{content.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[
              scenario.direction,
              `${scenario.grade} класс`,
              `${scenario.durationMin} мин`,
              scenario.format,
            ].map((b) => (
              <span
                key={b}
                className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-200"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/app">К дашборду</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Цели</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-neutral-700">
            {content.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {content.materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Материалы</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-neutral-700">
              {content.materials.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {content.stages.map((stage, i) => (
          <Card key={`${stage.title}-${i}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{stage.title}</span>
                <span className="text-sm font-normal text-neutral-500">
                  {KIND_LABEL[stage.kind] ?? stage.kind} · {stage.duration_min} мин
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stage.activities.map((a, j) => (
                <div key={`${a.type}-${j}`} className="rounded-md bg-neutral-50 p-3">
                  <span className="text-xs uppercase tracking-wide text-neutral-400">{a.type}</span>
                  <p className="mt-1 text-neutral-800">{a.text}</p>
                  {a.questions && a.questions.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-neutral-600">
                      {a.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Адаптация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-neutral-700">
          <p>
            <span className="font-medium text-neutral-900">Проще: </span>
            {content.adaptations.simpler}
          </p>
          <p>
            <span className="font-medium text-neutral-900">Сложнее: </span>
            {content.adaptations.harder}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
