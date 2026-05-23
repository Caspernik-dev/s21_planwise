import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { coerceActivityType } from './coerce'
import { type GeneratedBlock, buildRunningContext } from './context'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import {
  PROMPT_VERSION,
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildBlockMessages,
  buildSkeletonMessages,
} from './prompt'
import { checkBlock, checkScenario } from './quality'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  activitySchema,
  scenarioContentSchema,
  skeletonSchema,
} from './schema'
import { chunksForStage } from './stage-chunks'

const MAX_BLOCK_RETRIES = (() => {
  const n = Number(process.env.MAX_BLOCK_RETRIES)
  return Number.isFinite(n) && n >= 0 ? n : 2
})()

export type StreamEvent =
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'block'; index: number; total: number }
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

function parseBlock(raw: string): Activity | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  ;(obj as { type?: unknown }).type = coerceActivityType((obj as { type?: unknown }).type)
  const parsed = activitySchema.safeParse(obj)
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

    let repaired = false

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
      if (rep) repaired = true
      skeleton = rep?.value
    }
    if (!skeleton) throw new Error('Невалидный каркас сценария')

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
      let msgs: GigaMessage[] = buildBlockMessages(
        input,
        skeleton,
        st,
        brief,
        chunksForStage(ragChunks, st.kind),
        buildRunningContext(doneBlocks),
      )

      let best: Activity | null = null
      let accepted = false
      for (let r = 0; r <= MAX_BLOCK_RETRIES; r++) {
        const res = await generateValidated(chat, msgs, parseBlock, {
          attempts: 3,
          temperature: 0.5,
          corrective:
            'Ответ невалиден. Верни ТОЛЬКО валидный JSON одного блока { "type", "text", "questions"? }, без markdown.',
        })
        if (!res) break
        if (res.attempts > 1) repaired = true
        best = res.value
        const gate = checkBlock(res.value, st.kind)
        if (gate.ok) {
          accepted = true
          break
        }
        msgs = [
          ...msgs,
          {
            role: 'assistant',
            content: JSON.stringify({
              type: res.value.type,
              text: res.value.text,
              questions: res.value.questions,
            }),
          },
          {
            role: 'user',
            content: `Блок получился тонким (${gate.reasons.join(', ')}). Сделай его существенно плотнее: добавь ещё несколько реплик «Учитель: …» с конкретикой (факты, примеры, истории) и больше развёрнутых вопросов. Верни ТОЛЬКО валидный JSON одного блока.`,
          },
        ]
      }

      if (!best) throw new Error(`Не удалось сгенерировать блок «${brief.focus}»`)
      if (!accepted) thinBlocks++
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
      materials: skeleton.materials ?? [],
      adaptations: skeleton.adaptations ?? {
        simpler: 'Для младших классов упростить формулировки и сократить объём.',
        harder: 'Для старших классов углубить обсуждение и добавить задания.',
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
    const { warnings } = checkScenario(normalized)

    const meta: GenerationMeta = {
      model,
      promptVersion: PROMPT_VERSION,
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
    yield { type: 'error', message: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }
}
