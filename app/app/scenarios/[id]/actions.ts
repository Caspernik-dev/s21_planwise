'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, likes, scenarioVersions, scenarios, sharedScenarios } from '@/db/schema'
import { type SharedRow, sharedToScenarioInsert } from '@/lib/community/copy'
import { type StrictPiiResult, strictPiiCheck } from '@/lib/community/pii-gate'
import { resolveShareTarget } from '@/lib/community/share-target'
import { retrieveChunks } from '@/lib/rag/retrieve'
import type { RagChunkForPrompt } from '@/lib/scenario/prompt'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import { type ScenarioContent, scenarioContentSchema } from '@/lib/scenario/schema'
import { and, eq, sql } from 'drizzle-orm'
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

export type LikeResult =
  | { ok: true; liked: boolean; shared: boolean }
  | { ok: false; error: string; piiBlocked?: boolean }

export async function likeScenarioAction(
  scenarioId: string,
  optInShare: boolean,
): Promise<LikeResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const [existing] = await db
    .select({ id: likes.id, optInShare: likes.optInShare })
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.scenarioId, scenarioId)))
    .limit(1)

  // PII-gate ДО любых записей в shared
  let cleanResult: Extract<StrictPiiResult, { clean: true }> | null = null
  if (optInShare) {
    const check = strictPiiCheck(owned.content)
    if (!check.clean) {
      const kinds = Array.from(new Set(check.remaining.map((m) => m.type))).join(', ')
      return {
        ok: false,
        piiBlocked: true,
        error: `Найдены персональные данные (${kinds}). Уберите их вручную в тексте перед публикацией.`,
      }
    }
    cleanResult = check
  }

  // upsert лайка
  if (existing) {
    await db
      .update(likes)
      .set({ optInShare: optInShare || existing.optInShare })
      .where(eq(likes.id, existing.id))
  } else {
    await db.insert(likes).values({ userId, scenarioId, optInShare })
  }

  let shared = false
  if (optInShare && cleanResult) {
    const target = resolveShareTarget(
      { sourceSharedId: owned.sourceSharedId },
      { alreadyShared: existing?.optInShare ?? false },
    )
    if (target.action === 'increment') {
      await db
        .update(sharedScenarios)
        .set({ likeCount: sql`${sharedScenarios.likeCount} + 1` })
        .where(eq(sharedScenarios.id, target.sharedId))
      shared = true
    } else if (target.action === 'create') {
      let vec: number[] | null = null
      try {
        const { embed } = await import('@/lib/gigachat/embeddings')
        const text = `${owned.direction} ${owned.topic} ${cleanResult.anonymized.title}`
        const [v] = await embed([text])
        vec = v ?? null
      } catch (e) {
        console.error('shared embedding failed (non-fatal):', e)
      }
      const [row] = await db
        .insert(sharedScenarios)
        .values({
          sourceScenarioId: scenarioId,
          anonymizedContent: cleanResult.anonymized,
          direction: owned.direction,
          grade: owned.grade,
          durationMin: owned.durationMin,
          format: owned.format,
          topic: owned.topic,
          likeCount: 1,
        })
        .returning({ id: sharedScenarios.id })
      if (vec && row) {
        await db.execute(
          sql`UPDATE shared_scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${row.id}`,
        )
      }
      shared = true
    }
  }

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true, liked: true, shared }
}

export async function useSharedAsIsAction(sharedId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [shared] = await db
    .select({
      id: sharedScenarios.id,
      anonymizedContent: sharedScenarios.anonymizedContent,
      direction: sharedScenarios.direction,
      grade: sharedScenarios.grade,
      durationMin: sharedScenarios.durationMin,
      format: sharedScenarios.format,
      topic: sharedScenarios.topic,
    })
    .from(sharedScenarios)
    .where(eq(sharedScenarios.id, sharedId))
    .limit(1)
  if (!shared) redirect('/app/library')

  const [row] = await db
    .insert(scenarios)
    .values(sharedToScenarioInsert(shared as SharedRow, userId))
    .returning({ id: scenarios.id })
  await db
    .insert(scenarioVersions)
    .values({ scenarioId: row.id, content: shared.anonymizedContent })

  redirect(`/app/scenarios/${row.id}`)
}
