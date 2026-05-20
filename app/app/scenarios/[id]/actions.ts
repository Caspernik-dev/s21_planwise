'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, scenarioVersions, scenarios } from '@/db/schema'
import { retrieveChunks } from '@/lib/rag/retrieve'
import type { RagChunkForPrompt } from '@/lib/scenario/prompt'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import { type ScenarioContent, scenarioContentSchema } from '@/lib/scenario/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function loadOwned(scenarioId: string, userId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  return row ?? null
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveScenarioAction(
  scenarioId: string,
  rawContent: unknown,
): Promise<SaveResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const parsed = scenarioContentSchema.safeParse(rawContent)
  if (!parsed.success) return { ok: false, error: 'Сценарий не прошёл валидацию' }

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const content: ScenarioContent = parsed.data
  await db.transaction(async (tx) => {
    await tx
      .update(scenarios)
      .set({ title: content.title, content, updatedAt: new Date() })
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    await tx.insert(scenarioVersions).values({ scenarioId, content })
  })

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true }
}

export type RegenResult =
  | { ok: true; activity: ScenarioContent['stages'][number]['activities'][number] }
  | { ok: false; error: string }

export async function regenerateActivityAction(
  scenarioId: string,
  stageIndex: number,
  activityIndex: number,
): Promise<RegenResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const content = owned.content
  const stage = content.stages[stageIndex]
  const current = stage?.activities[activityIndex]
  if (!stage || !current) return { ok: false, error: 'Активность не найдена' }

  let ragChunks: RagChunkForPrompt[] = []
  try {
    const found = await retrieveChunks({
      direction: owned.direction,
      grade: owned.grade,
      topic: owned.topic,
    })
    ragChunks = found.map((c) => ({
      text: c.chunkText,
      documentTitle: c.documentTitle,
      sectionKind: c.sectionKind,
    }))
  } catch (e) {
    console.error('RAG retrieval failed for regenerate (non-fatal):', e)
  }

  try {
    const activity = await regenerateActivity(
      {
        scenario: {
          direction: owned.direction,
          grade: owned.grade,
          topic: owned.topic,
          format: owned.format,
          title: content.title,
        },
        stage: { kind: stage.kind, title: stage.title },
        current,
      },
      { ragChunks },
    )
    await db
      .insert(generations)
      .values({ userId, scenarioId, latencyMs: null, status: 'ok' })
      .catch(() => {})
    return { ok: true, activity }
  } catch (e) {
    await db
      .insert(generations)
      .values({ userId, scenarioId, latencyMs: null, status: 'error' })
      .catch(() => {})
    console.error('regenerateActivityAction failed:', e)
    return { ok: false, error: 'Не удалось перегенерировать активность' }
  }
}
