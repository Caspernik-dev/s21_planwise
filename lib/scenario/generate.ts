import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { coerceContentTypes } from './coerce'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { getPromptVersion } from './prompts'
import { buildMessages } from './prompts/rov'
import type { RagChunkForPrompt, SharedExampleForPrompt } from './prompts/shared'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  scenarioContentSchema,
} from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

type RetrieveFn = (q: {
  direction: string | null
  grade: number
  topic: string
}) => Promise<Array<{ id: string; chunkText: string; documentTitle: string; sectionKind: string }>>

export type GenerateDeps = {
  chat?: ChatFn
  retrieve?: RetrieveFn
  prematch?: typeof prematchShared
}

function extractJson(raw: string): unknown {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('JSON-объект не найден в ответе')
  }
  return JSON.parse(s.slice(start, end + 1))
}

function tryParse(raw: string): ScenarioContent | null {
  try {
    const obj = coerceContentTypes(extractJson(raw))
    const parsed = scenarioContentSchema.safeParse(obj)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function generateScenario(
  input: GenerationInput,
  deps: GenerateDeps = {},
): Promise<{ content: ScenarioContent; meta: GenerationMeta }> {
  const chat = deps.chat ?? chatCompletion
  const cfg = (() => {
    try {
      return getGigaConfig()
    } catch {
      return { model: process.env.GIGACHAT_MODEL ?? 'GigaChat-2-Max' }
    }
  })()

  const started = Date.now()

  const retrieve = deps.retrieve ?? ((q) => retrieveChunks(q))
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
    console.error('RAG retrieval failed, generating without methodology:', e)
  }

  const prematch = deps.prematch ?? prematchShared
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
    console.error('shared examples fetch failed (non-fatal):', e)
  }

  const messages = buildMessages(input, ragChunks, sharedExamples)

  const result = await generateValidated(chat, messages, tryParse, {
    attempts: 3,
    temperature: 0.4,
  })
  if (!result) {
    throw new Error('GigaChat вернул невалидный сценарий после нескольких попыток')
  }
  const usage = result.usage
  const repaired = result.attempts > 1

  const { content, changed } = normalizeChronometry(result.value, input.durationMin)

  const meta: GenerationMeta = {
    model: cfg.model,
    promptVersion: getPromptVersion(input.lessonType),
    repaired,
    normalized: changed,
    usage,
    latencyMs: Date.now() - started,
    usedChunkIds,
  }

  return { content, meta }
}
