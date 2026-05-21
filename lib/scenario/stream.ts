import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { coerceActivityType } from './coerce'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import {
  PROMPT_VERSION,
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildSkeletonMessages,
  buildStageDetailsMessages,
} from './prompt'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  scenarioContentSchema,
  skeletonSchema,
  stageActivitiesSchema,
} from './schema'

export type StreamEvent =
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'stage'; index: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }

type ChatStreamFn = (
  messages: GigaMessage[],
  opts?: { temperature?: number },
) => AsyncGenerator<string, void, unknown>

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

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

type Activity = ScenarioContent['stages'][number]['activities'][number]

function parseSkeleton(raw: string): ScenarioSkeleton | null {
  const obj = parsePartialJson(raw)
  if (obj === null) return null
  const parsed = skeletonSchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}

function parseStageActivities(raw: string): Activity[] | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  const acts = (obj as { activities?: unknown }).activities
  if (Array.isArray(acts)) {
    for (const a of acts) {
      if (a && typeof a === 'object') {
        ;(a as { type?: unknown }).type = coerceActivityType((a as { type?: unknown }).type)
      }
    }
  }
  const parsed = stageActivitiesSchema.safeParse(obj)
  return parsed.success ? parsed.data.activities : null
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
        direction: input.direction,
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
      console.error('RAG retrieval failed (non-fatal):', e)
    }

    let sharedExamples: SharedExampleForPrompt[] = []
    try {
      const matches = await prematch(
        {
          direction: input.direction,
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
      console.error('shared examples fetch failed (non-fatal):', e)
    }

    // STAGE 1: skeleton
    yield { type: 'phase', phase: 'skeleton' }
    const skMessages = buildSkeletonMessages(input, ragChunks, sharedExamples)
    const skRaw = await collectStream(chatStream(skMessages, { temperature: 0.4 }))
    const skObj = parsePartialJson(skRaw)
    if (skObj) yield { type: 'skeleton', data: skObj }
    let skeleton = parseSkeleton(skRaw) ?? undefined
    if (!skeleton) {
      const rep = await generateValidated(chat, skMessages, parseSkeleton, {
        attempts: 3,
        temperature: 0.3,
        corrective: 'Каркас невалиден. Верни ТОЛЬКО валидный JSON каркаса строго по схеме.',
      })
      skeleton = rep?.value
    }
    if (!skeleton) throw new Error('Невалидный каркас сценария')

    // STAGE 2: детали ПО-ЭТАПНО — отдельный фокусный вызов на каждый этап (РоВ-глубина).
    yield { type: 'phase', phase: 'details' }
    let repaired = false
    const builtStages: ScenarioContent['stages'] = []
    for (let i = 0; i < skeleton.stages.length; i++) {
      const st = skeleton.stages[i]
      const msgs = buildStageDetailsMessages(input, skeleton, st, ragChunks)
      const res = await generateValidated(chat, msgs, parseStageActivities, {
        attempts: 3,
        temperature: 0.5,
        corrective:
          'Ответ невалиден. Верни ТОЛЬКО валидный JSON { "activities": [...] } этого этапа, без markdown.',
      })
      if (!res) throw new Error(`Не удалось сгенерировать этап «${st.title}»`)
      if (res.attempts > 1) repaired = true
      builtStages.push({
        kind: st.kind,
        title: st.title,
        duration_min: st.duration_min,
        activities: res.value,
      })
      yield { type: 'stage', index: i }
    }

    yield { type: 'phase', phase: 'validating' }
    const assembled = {
      title: skeleton.title,
      goals: skeleton.goals,
      values: skeleton.values,
      coreMeanings: skeleton.coreMeanings,
      materials: skeleton.materials ?? [],
      adaptations: skeleton.adaptations ?? {
        simpler: 'Для младших классов упростить формулировки и сократить объём.',
        harder: 'Для старших классов углубить обсуждение и добавить задания.',
      },
      stages: builtStages,
    }
    const parsedFull = scenarioContentSchema.safeParse(assembled)
    if (!parsedFull.success) throw new Error('Собранный сценарий не прошёл валидацию')
    const content = parsedFull.data

    const { content: normalized, changed } = normalizeChronometry(content, input.durationMin)

    const meta: GenerationMeta = {
      model,
      promptVersion: PROMPT_VERSION,
      repaired,
      normalized: changed,
      usage: null,
      latencyMs: Date.now() - started,
      usedChunkIds,
    }

    yield { type: 'phase', phase: 'saving' }
    const scenarioId = await deps.save(normalized, meta)
    yield { type: 'done', scenarioId }
  } catch (e) {
    console.error('streamScenario failed:', e)
    yield { type: 'error', message: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }
}
