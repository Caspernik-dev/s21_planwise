import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { ScenarioEditor } from './editor'

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

  return (
    <ScenarioEditor
      meta={{
        id: scenario.id,
        direction: scenario.direction,
        grade: scenario.grade,
        durationMin: scenario.durationMin,
        format: scenario.format,
      }}
      initialContent={scenario.content}
    />
  )
}
