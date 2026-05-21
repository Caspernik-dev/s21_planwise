import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { coerceContentTypes } from './coerce'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import {
  PROMPT_VERSION,
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildDetailsMessages,
  buildSkeletonMessages,
} from './prompt'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  scenarioContentSchema,
  skeletonSchema,
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

function parseContent(raw: string): ScenarioContent | null {
  const obj = parsePartialJson(raw)
  if (obj === null) return null
  const parsed = scenarioContentSchema.safeParse(coerceContentTypes(obj))
  return parsed.success ? parsed.data : null
}

function parseSkeleton(raw: string): ScenarioSkeleton | null {
  const obj = parsePartialJson(raw)
  if (obj === null) return null
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

    // STAGE 2: details
    yield { type: 'phase', phase: 'details' }
    const dtMessages = buildDetailsMessages(input, skeleton, ragChunks)
    const dtRaw = await collectStream(chatStream(dtMessages, { temperature: 0.4 }))

    yield { type: 'phase', phase: 'validating' }
    let content = parseContent(dtRaw)
    let repaired = false
    if (!content) {
      repaired = true
      const rep = await generateValidated(chat, dtMessages, parseContent, {
        attempts: 3,
        temperature: 0.3,
        corrective: 'Ответ невалиден. Верни ТОЛЬКО валидный JSON по полной схеме, без markdown.',
      })
      content = rep?.value ?? null
    }
    if (!content) throw new Error('GigaChat вернул невалидный сценарий после ретраев')

    for (let i = 0; i < content.stages.length; i++) {
      yield { type: 'stage', index: i }
    }

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
