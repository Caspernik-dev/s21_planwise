'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, planTopics, scenarioVersions, scenarios } from '@/db/schema'
import { prematchShared } from '@/lib/community/prematch'
import { generateScenario } from '@/lib/scenario/generate'
import { generationInputSchema } from '@/lib/scenario/schema'
import { and, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export type NewScenarioState = { error?: string } | null

export type PrematchCard = {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: Array<{ title: string }>
}

export async function prematchAction(formData: FormData): Promise<PrematchCard[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const parsed = generationInputSchema.safeParse({
    direction: formData.get('direction'),
    grade: formData.get('grade'),
    topic: formData.get('topic'),
    durationMin: formData.get('durationMin'),
    format: formData.get('format'),
  })
  if (!parsed.success) return []
  const i = parsed.data
  try {
    const matches = await prematchShared({
      direction: i.direction,
      grade: i.grade,
      topic: i.topic,
      format: i.format,
    })
    return matches.map((m) => ({
      id: m.id,
      title: m.title,
      direction: m.direction,
      format: m.format,
      likeCount: m.likeCount,
      stages: ((m.anonymizedContent as { stages?: Array<{ title: string }> }).stages ?? []).map(
        (s) => ({ title: s.title }),
      ),
    }))
  } catch (e) {
    console.error('prematchAction failed (non-fatal):', e)
    return []
  }
}

export async function generateScenarioAction(
  _prev: NewScenarioState,
  formData: FormData,
): Promise<NewScenarioState> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const rawTopicId = formData.get('planTopicId')
  let sourcePlanTopicId: string | null = null
  if (typeof rawTopicId === 'string' && rawTopicId.length > 0) {
    const [t] = await db
      .select({ id: planTopics.id })
      .from(planTopics)
      .where(and(eq(planTopics.id, rawTopicId), eq(planTopics.userId, userId)))
      .limit(1)
    if (t) sourcePlanTopicId = t.id
  }

  const parsed = generationInputSchema.safeParse({
    direction: formData.get('direction'),
    grade: formData.get('grade'),
    topic: formData.get('topic'),
    durationMin: formData.get('durationMin'),
    format: formData.get('format'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте поля формы' }
  }
  const input = parsed.data

  let scenarioId: string
  try {
    const { content, meta } = await generateScenario(input)

    const [row] = await db
      .insert(scenarios)
      .values({
        userId,
        title: content.title,
        direction: input.direction,
        grade: input.grade,
        durationMin: input.durationMin,
        format: input.format,
        topic: input.topic,
        sourcePlanTopicId,
        content,
        inputContext: input,
        generationMeta: meta,
      })
      .returning({ id: scenarios.id })

    scenarioId = row.id

    await db.insert(scenarioVersions).values({ scenarioId, content })
    await db.insert(generations).values({
      userId,
      scenarioId,
      promptTokens: meta.usage?.promptTokens ?? null,
      completionTokens: meta.usage?.completionTokens ?? null,
      latencyMs: meta.latencyMs,
      status: 'ok',
    })

    try {
      const { embed } = await import('@/lib/gigachat/embeddings')
      const [vec] = await embed([`${input.direction} ${input.topic} ${content.title}`])
      await db.execute(
        sql`UPDATE scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${scenarioId}`,
      )
    } catch (e) {
      console.error('scenario embedding failed (non-fatal):', e)
    }
  } catch (e) {
    await db
      .insert(generations)
      .values({ userId, scenarioId: null, latencyMs: null, status: 'error' })
      .catch(() => {})
    console.error('generateScenarioAction failed:', e)
    return { error: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }

  redirect(`/app/scenarios/${scenarioId}`)
}
