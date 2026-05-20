'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, scenarioVersions, scenarios } from '@/db/schema'
import { generateScenario } from '@/lib/scenario/generate'
import { generationInputSchema } from '@/lib/scenario/schema'
import { sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export type NewScenarioState = { error?: string } | null

export async function generateScenarioAction(
  _prev: NewScenarioState,
  formData: FormData,
): Promise<NewScenarioState> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

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
