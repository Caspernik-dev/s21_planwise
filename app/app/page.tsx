import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">Мои сценарии</h1>
        <Button asChild>
          <Link href="/app/new">Создать сценарий</Link>
        </Button>
      </div>

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
