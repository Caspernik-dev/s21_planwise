import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { QueueOverflowError, QueueTimeoutError } from '@/lib/gigachat/concurrency'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { type Activity, generateBlockWithGate } from './block-gen'
import { coerceActivityType } from './coerce'
import { type GeneratedBlock, buildRunningContext } from './context'
import { gradeToLevel } from './levels'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import { getCatalog, selectPersonalResults } from './personal-results'
import {
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildBlockMessages,
  buildSkeletonMessages,
  getPromptVersion,
} from './prompts'
import * as Event from './prompts/event'
import { checkScenario } from './quality'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  scenarioContentSchema,
  skeletonSchema,
} from './schema'
import { chunksForStage } from './stage-chunks'

export type StreamEvent =
  | { type: 'queued'; position: number }
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string; code?: 'queue_overflow' | 'queue_timeout' }

type ChatStreamFn = (
  messages: GigaMessage[],
  opts?: { temperature?: number; onQueued?: (position: number) => void },
) => AsyncGenerator<string, void, unknown>

type ChatFn = (
  messages: GigaMessage[],
  opts?: { temperature?: number; onQueued?: (position: number) => void },
) => Promise<ChatResult>

type RetrieveFn = (q: {
  direction: string | null
  grade: number
  topic: string
}) => Promise<Array<{ id: string; chunkText: string; documentTitle: string; sectionKind: string }>>

export type StreamDeps = {
  chatStream?: ChatStreamFn
  chat?: ChatFn
  retrieve?: RetrieveFn
  prematch?: typeof prematchShared
  save: (content: ScenarioContent, meta: GenerationMeta) => Promise<string>
}

async function collectStream(gen: AsyncGenerator<string, void, unknown>): Promise<string> {
  let buf = ''
  for await (const piece of gen) buf += piece
  return buf
}

function parseSkeleton(raw: string): ScenarioSkeleton | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  // Коэрсим blocks[].type каркаса к нашему enum — модель для форматов вроде «дебаты»
  // ставит type:"debate"/presentation/group_work, что иначе валит весь каркас по zod.
  const stages = (obj as { stages?: unknown }).stages
  if (Array.isArray(stages)) {
    for (const st of stages) {
      const blocks = st && typeof st === 'object' ? (st as { blocks?: unknown }).blocks : undefined
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b && typeof b === 'object') {
            ;(b as { type?: unknown }).type = coerceActivityType((b as { type?: unknown }).type)
          }
        }
      }
    }
  }
  const parsed = skeletonSchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}

export async function* streamScenario(
  input: GenerationInput,
  deps: StreamDeps,
): AsyncGenerator<StreamEvent, void, unknown> {
  const chatStream = deps.chatStream ?? chatCompletionStream
  const chat = deps.chat ?? chatCompletion
  const retrieve = deps.retrieve ?? ((q) => retrieveChunks(q))
  const prematch = deps.prematch ?? prematchShared
  const model = (() => {
    try {
      return getGigaConfig().model
    } catch {
      return process.env.GIGACHAT_MODEL ?? 'GigaChat-2-Max'
    }
  })()
  const started = Date.now()

  try {
    let ragChunks: RagChunkForPrompt[] = []
    let usedChunkIds: string[] = []
    try {
      const found = await retrieve({
        direction: input.direction ?? null,
        grade: input.grade,
        topic: input.topic,
      })
      ragChunks = found.map((c) => ({
        text: c.chunkText,
        documentTitle: c.documentTitle,
        sectionKind: c.sectionKind,
      }))
      usedChunkIds = found.map((c) => c.id)
    } catch (e) {
      if (e instanceof QueueOverflowError || e instanceof QueueTimeoutError) throw e
      console.error('RAG retrieval failed (non-fatal):', e)
    }

    let sharedExamples: SharedExampleForPrompt[] = []
    try {
      const matches = await prematch(
        {
          lessonType: input.lessonType,
          direction: input.direction ?? '',
          grade: input.grade,
          topic: input.topic,
          format: input.format,
        },
        { topK: 2 },
      )
      sharedExamples = matches.map((m) => ({
        title: m.title,
        summary: ((m.anonymizedContent as { stages?: Array<{ title: string }> }).stages ?? [])
          .map((s) => s.title)
          .join(' → '),
      }))
    } catch (e) {
      if (e instanceof QueueOverflowError || e instanceof QueueTimeoutError) throw e
      console.error('shared examples fetch failed (non-fatal):', e)
    }

    let repaired = false

    const pendingQueued: number[] = []
    const onQueuedFirst = (position: number) => {
      pendingQueued.push(position)
    }

    // STAGE 1: skeleton
    yield { type: 'phase', phase: 'skeleton' }
    const skMessages = buildSkeletonMessages(input, {
      chunks: ragChunks,
      examples: sharedExamples,
      userMaterial: input.userMaterial ?? '',
    })
    const skStream = chatStream(skMessages, { temperature: 0.4, onQueued: onQueuedFirst })
    let skRaw = ''
    while (pendingQueued.length > 0)
      yield { type: 'queued', position: pendingQueued.shift() as number }
    for await (const piece of skStream) {
      while (pendingQueued.length > 0)
        yield { type: 'queued', position: pendingQueued.shift() as number }
      skRaw += piece
    }
    const skObj = parsePartialJson(skRaw)
    if (skObj) yield { type: 'skeleton', data: skObj }
    let skeleton = parseSkeleton(skRaw) ?? undefined
    if (!skeleton) {
      const rep = await generateValidated(chat, skMessages, parseSkeleton, {
        attempts: 3,
        temperature: 0.3,
        corrective: 'Каркас невалиден. Верни ТОЛЬКО валидный JSON каркаса строго по схеме.',
      })
      if (rep) repaired = true
      skeleton = rep?.value
    }
    if (!skeleton) throw new Error('Невалидный каркас сценария')

    // Whitelist личностных результатов — только для rov и event (занятия с ФГОС-каталогом).
    // krujok/literacy/subject_extension не привязаны к направлениям ФГОС.
    if (input.lessonType === 'rov') {
      const prCatalog = input.direction
        ? getCatalog(gradeToLevel(input.grade), input.direction)
        : []
      skeleton.personalResults = selectPersonalResults(skeleton.personalResults, prCatalog)
    } else if (input.lessonType === 'event' && input.direction) {
      skeleton = Event.applyPersonalResultsWhitelist(skeleton, input)
    }

    // STAGE 2: детали ПО БЛОКАМ — отдельный фокусный вызов на каждый блок (РоВ-глубина).
    // Объём масштабируется числом блоков; катящийся контекст держит связность;
    // локальный гейт перегенерирует тонкие блоки.
    yield { type: 'phase', phase: 'details' }

    type Pending = { stageIndex: number; brief: { type: string; focus: string } }
    const queue: Pending[] = []
    skeleton.stages.forEach((st, stageIndex) => {
      const briefs =
        st.blocks && st.blocks.length > 0 ? st.blocks : [{ type: 'discussion', focus: st.title }]
      for (const b of briefs) queue.push({ stageIndex, brief: b })
    })
    const total = queue.length

    let thinBlocks = 0
    const doneBlocks: GeneratedBlock[] = []
    const stageActivities: Activity[][] = skeleton.stages.map(() => [])

    for (let i = 0; i < queue.length; i++) {
      const { stageIndex, brief } = queue[i]
      const st = skeleton.stages[stageIndex]
      const msgs: GigaMessage[] = buildBlockMessages(
        input,
        skeleton,
        st,
        brief,
        chunksForStage(ragChunks, st.kind),
        buildRunningContext(doneBlocks),
        input.userMaterial ?? '',
      )

      const r = await generateBlockWithGate(chat, msgs, st.kind, { lessonType: input.lessonType })
      if (!r) throw new Error(`Не удалось сгенерировать блок «${brief.focus}»`)
      if (r.repaired) repaired = true
      if (!r.accepted) thinBlocks++
      const best = r.value

      stageActivities[stageIndex].push(best)
      doneBlocks.push({ stageTitle: st.title, type: best.type, text: best.text })
      yield { type: 'block', index: i, total }
    }

    yield { type: 'phase', phase: 'validating' }
    const assembled = {
      title: skeleton.title,
      goals: skeleton.goals,
      values: skeleton.values,
      coreMeanings: skeleton.coreMeanings,
      personalResults: skeleton.personalResults,
      materials: skeleton.materials ?? [],
      // мягкие адаптации каркаса доводим дефолтами по-полю (модель шлёт {} или частичный объект)
      adaptations: {
        simpler:
          skeleton.adaptations?.simpler ??
          'Для младших классов упростить формулировки и сократить объём.',
        harder:
          skeleton.adaptations?.harder ??
          'Для старших классов углубить обсуждение и добавить задания.',
      },
      stages: skeleton.stages.map((st, idx) => ({
        kind: st.kind,
        title: st.title,
        duration_min: st.duration_min,
        activities: stageActivities[idx],
      })),
    }
    const parsedFull = scenarioContentSchema.safeParse(assembled)
    if (!parsedFull.success) throw new Error('Собранный сценарий не прошёл валидацию')
    const content = parsedFull.data

    const { content: normalized, changed } = normalizeChronometry(content, input.durationMin)
    const { warnings } = checkScenario(normalized, { lessonType: input.lessonType })

    const meta: GenerationMeta = {
      model,
      promptVersion: getPromptVersion(input.lessonType),
      repaired,
      normalized: changed,
      usage: null,
      latencyMs: Date.now() - started,
      usedChunkIds,
      thinBlocks,
      qualityWarnings: warnings,
    }

    yield { type: 'phase', phase: 'saving' }
    const scenarioId = await deps.save(normalized, meta)
    yield { type: 'done', scenarioId }
  } catch (e) {
    console.error('streamScenario failed:', e)
    if (e instanceof QueueOverflowError) {
      yield {
        type: 'error',
        code: 'queue_overflow',
        message: 'Сервис временно перегружен, попробуйте через минуту.',
      }
      return
    }
    if (e instanceof QueueTimeoutError) {
      yield {
        type: 'error',
        code: 'queue_timeout',
        message: 'Очередь не освободилась за 5 минут. Попробуйте позже.',
      }
      return
    }
    yield { type: 'error', message: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }
}
