import { auth } from '@/auth'
import { db } from '@/db'
import { generations, likes, scenarios } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
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

  const [like] = await db
    .select({ optInShare: likes.optInShare })
    .from(likes)
    .where(and(eq(likes.userId, session.user.id), eq(likes.scenarioId, id)))
    .limit(1)

  const [gen] = await db
    .select({ rating: generations.rating, feedback: generations.feedback })
    .from(generations)
    .where(
      and(
        eq(generations.scenarioId, id),
        eq(generations.userId, session.user.id),
        eq(generations.kind, 'full'),
      ),
    )
    .orderBy(desc(generations.createdAt))
    .limit(1)

  return (
    <ScenarioEditor
      meta={{
        id: scenario.id,
        topic: scenario.topic,
        direction: scenario.direction,
        grade: scenario.grade,
        durationMin: scenario.durationMin,
        format: scenario.format,
      }}
      initialContent={scenario.content}
      initialLiked={!!like}
      initialShared={like?.optInShare ?? false}
      initialShareToken={scenario.shareToken}
      initialRating={gen?.rating ?? null}
      initialFeedback={gen?.feedback ?? null}
    />
  )
}
