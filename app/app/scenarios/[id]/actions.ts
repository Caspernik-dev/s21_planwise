'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, likes, scenarioVersions, scenarios, sharedScenarios } from '@/db/schema'
import { type SharedRow, sharedToScenarioInsert } from '@/lib/community/copy'
import { type StrictPiiResult, strictPiiCheck } from '@/lib/community/pii-gate'
import { resolveShareTarget } from '@/lib/community/share-target'
import type { LessonType } from '@/lib/scenario/options'
import { type ScenarioPiiWarning, scanScenarioPii } from '@/lib/pii/scenario-scan'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { checkRateLimit } from '@/lib/ratelimit'
import { coerceActivityType } from '@/lib/scenario/coerce'
import { type GeneratedBlock, buildRunningContext } from '@/lib/scenario/context'
import type { RagChunkForPrompt } from '@/lib/scenario/prompt'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import {
  type GenerationInput,
  type ScenarioContent,
  type ScenarioSkeleton,
  scenarioContentSchema,
} from '@/lib/scenario/schema'
import { generateShareToken } from '@/lib/share/token'
import { and, desc, eq, sql } from 'drizzle-orm'
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

export type SaveResult = { ok: true; piiWarning?: string } | { ok: false; error: string }

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

  const pii = scanScenarioPii(content)
  revalidatePath(`/app/scenarios/${scenarioId}`)
  if (pii) {
    return {
      ok: true,
      piiWarning: `Внимание: в тексте найдены возможные персональные данные (${pii.kinds.join(', ')}). Они сохранены как есть, но не попадут в библиотеку сообщества без обезличивания.`,
    }
  }
  return { ok: true }
}

export type RegenResult =
  | { ok: true; activity: ScenarioContent['stages'][number]['activities'][number] }
  | { ok: false; error: string }

export async function regenerateActivityAction(
  scenarioId: string,
  stageIndex: number,
  activityIndex: number,
  type: string,
): Promise<RegenResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const rl = await checkRateLimit({
    key: 'regenerate',
    subject: userId,
    email: session.user.email,
    limit: Number(process.env.MAX_REGEN_PER_DAY ?? '40'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) {
    return { ok: false, error: 'Дневной лимит регенераций исчерпан. Попробуйте позже.' }
  }

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

  const started = Date.now()
  try {
    const targetType = coerceActivityType(type)
    const skeleton: ScenarioSkeleton = {
      title: content.title,
      goals: content.goals,
      values: content.values,
      coreMeanings: content.coreMeanings,
      materials: content.materials,
      adaptations: content.adaptations,
      stages: content.stages.map((s) => ({
        kind: s.kind,
        title: s.title,
        duration_min: s.duration_min,
      })),
    }
    const siblings: GeneratedBlock[] = []
    content.stages.forEach((s, si) => {
      s.activities.forEach((a, ai) => {
        if (si === stageIndex && ai === activityIndex) return
        siblings.push({ stageTitle: s.title, type: a.type, text: a.text })
      })
    })
    const activity = await regenerateActivity(
      {
        input: {
          lessonType: (owned.lessonType ?? 'rov') as GenerationInput['lessonType'],
          direction: owned.direction as GenerationInput['direction'],
          grade: owned.grade,
          topic: owned.topic,
          durationMin: owned.durationMin,
          format: owned.format as GenerationInput['format'],
        },
        skeleton,
        stage: { kind: stage.kind, title: stage.title, duration_min: stage.duration_min },
        targetType,
        runningContext: buildRunningContext(siblings),
      },
      { ragChunks },
    )
    await db
      .insert(generations)
      .values({ userId, scenarioId, latencyMs: Date.now() - started, status: 'ok', kind: 'regen' })
      .catch(() => {})
    return { ok: true, activity }
  } catch (e) {
    await db
      .insert(generations)
      .values({
        userId,
        scenarioId,
        latencyMs: Date.now() - started,
        status: 'error',
        kind: 'regen',
      })
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
      { sourceSharedId: owned.sourceSharedId, lessonType: (owned.lessonType ?? 'rov') as LessonType },
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
          lessonType: target.lessonType,
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

  const rl = await checkRateLimit({
    key: 'use-shared',
    subject: userId,
    email: session.user.email,
    limit: Number(process.env.MAX_COPY_PER_DAY ?? '50'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) redirect('/app/library?error=rate')

  const [shared] = await db
    .select({
      id: sharedScenarios.id,
      anonymizedContent: sharedScenarios.anonymizedContent,
      direction: sharedScenarios.direction,
      grade: sharedScenarios.grade,
      durationMin: sharedScenarios.durationMin,
      format: sharedScenarios.format,
      topic: sharedScenarios.topic,
      lessonType: sharedScenarios.lessonType,
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

export type EnableShareResult =
  | { ok: true; token: string; piiWarning: ScenarioPiiWarning | null }
  | { ok: false; error: string }

export async function enableShareLinkAction(scenarioId: string): Promise<EnableShareResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано' }
  const userId = session.user.id

  const [row] = await db
    .select({ shareToken: scenarios.shareToken, content: scenarios.content })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  if (!row) return { ok: false, error: 'Сценарий не найден' }

  let token = row.shareToken
  if (!token) {
    token = generateShareToken()
    await db
      .update(scenarios)
      .set({ shareToken: token })
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
  }

  const piiWarning = scanScenarioPii(row.content)
  return { ok: true, token, piiWarning }
}

export async function disableShareLinkAction(
  scenarioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано' }
  await db
    .update(scenarios)
    .set({ shareToken: null })
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, session.user.id)))
  return { ok: true }
}

export async function copyScenarioByTokenAction(token: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [src] = await db.select().from(scenarios).where(eq(scenarios.shareToken, token)).limit(1)
  if (!src) redirect('/app')

  const [copy] = await db
    .insert(scenarios)
    .values({
      userId,
      title: src.title,
      direction: src.direction,
      grade: src.grade,
      durationMin: src.durationMin,
      format: src.format,
      topic: src.topic,
      content: src.content,
      inputContext: src.inputContext,
      generationMeta: src.generationMeta,
    })
    .returning({ id: scenarios.id })

  await db.insert(scenarioVersions).values({ scenarioId: copy.id, content: src.content })
  redirect(`/app/scenarios/${copy.id}`)
}

export type RateResult = { ok: true } | { ok: false; error: string }

export async function rateGenerationAction(
  scenarioId: string,
  rating: number,
  feedback?: string,
): Promise<RateResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано.' }
  if (rating !== 1 && rating !== -1) return { ok: false, error: 'Некорректная оценка.' }

  const [gen] = await db
    .select({ id: generations.id })
    .from(generations)
    .where(
      and(
        eq(generations.scenarioId, scenarioId),
        eq(generations.userId, session.user.id),
        eq(generations.kind, 'full'),
      ),
    )
    .orderBy(desc(generations.createdAt))
    .limit(1)

  if (!gen) return { ok: false, error: 'Нет генерации для оценки.' }

  const trimmed = feedback?.trim()
  await db
    .update(generations)
    .set({ rating, feedback: trimmed ? trimmed.slice(0, 1000) : null })
    .where(and(eq(generations.id, gen.id), eq(generations.userId, session.user.id)))

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true }
}

export type VersionListItem = { id: string; createdAt: string }
export type ListVersionsResult =
  | { ok: true; versions: VersionListItem[] }
  | { ok: false; error: string }

export async function listVersionsAction(scenarioId: string): Promise<ListVersionsResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано.' }

  const owned = await loadOwned(scenarioId, session.user.id)
  if (!owned) return { ok: false, error: 'Сценарий не найден.' }

  const rows = await db
    .select({ id: scenarioVersions.id, createdAt: scenarioVersions.createdAt })
    .from(scenarioVersions)
    .where(eq(scenarioVersions.scenarioId, scenarioId))
    .orderBy(desc(scenarioVersions.createdAt))
    .limit(30)

  return {
    ok: true,
    versions: rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString() })),
  }
}

export type GetVersionResult = { ok: true; content: ScenarioContent } | { ok: false; error: string }

export async function getVersionAction(
  scenarioId: string,
  versionId: string,
): Promise<GetVersionResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано.' }

  const owned = await loadOwned(scenarioId, session.user.id)
  if (!owned) return { ok: false, error: 'Сценарий не найден.' }

  const [version] = await db
    .select({ content: scenarioVersions.content })
    .from(scenarioVersions)
    .where(and(eq(scenarioVersions.id, versionId), eq(scenarioVersions.scenarioId, scenarioId)))
    .limit(1)
  if (!version) return { ok: false, error: 'Версия не найдена.' }

  return { ok: true, content: version.content }
}

export async function restoreVersionAction(
  scenarioId: string,
  versionId: string,
): Promise<GetVersionResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано.' }
  const userId = session.user.id

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден.' }

  const [version] = await db
    .select({ content: scenarioVersions.content })
    .from(scenarioVersions)
    .where(and(eq(scenarioVersions.id, versionId), eq(scenarioVersions.scenarioId, scenarioId)))
    .limit(1)
  if (!version) return { ok: false, error: 'Версия не найдена.' }

  const content = version.content
  await db.transaction(async (tx) => {
    await tx
      .update(scenarios)
      .set({ title: content.title, content, updatedAt: new Date() })
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    await tx.insert(scenarioVersions).values({ scenarioId, content })
  })

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true, content }
}
