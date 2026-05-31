import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { coerceActivityType } from './coerce'
import { generateValidated } from './llm-retry'
import type { LessonType } from './options'
import { parsePartialJson } from './partial'
import { checkBlock } from './quality'
import { extractOrFallbackQuery, sanitizeRutubeText } from './rutube'
import { type ScenarioContent, activitySchema } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>
export type Activity = ScenarioContent['stages'][number]['activities'][number]

const DEFAULT_MAX_RETRIES = (() => {
  const n = Number(process.env.MAX_BLOCK_RETRIES)
  return Number.isFinite(n) && n >= 0 ? n : 2
})()

// Парс ответа одного блока: дополнить оборванный JSON → коэрсить type → zod.
export function parseBlock(raw: string): Activity | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  ;(obj as { type?: unknown }).type = coerceActivityType((obj as { type?: unknown }).type)
  const parsed = activitySchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}

// Сгенерировать ОДИН блок с детерминированным гейтом качества: при «тонкости»
// заострить промпт и повторить до maxRetries. Возвращает лучший результат + флаги.
export type VideoCtx = {
  topic: string
  direction: string | undefined
  leadingValue: string | undefined
}

export async function generateBlockWithGate(
  chat: ChatFn,
  messages: GigaMessage[],
  stageKind: string,
  opts: { maxRetries?: number; lessonType?: LessonType; videoCtx?: VideoCtx } = {},
): Promise<{ value: Activity; repaired: boolean; accepted: boolean } | null> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  let msgs = messages
  let best: Activity | null = null
  let repaired = false
  let accepted = false

  for (let r = 0; r <= maxRetries; r++) {
    const res = await generateValidated(chat, msgs, parseBlock, {
      attempts: 3,
      temperature: 0.5,
      corrective:
        'Ответ невалиден. Верни ТОЛЬКО валидный JSON одного блока { "type", "text", "questions"? }, без markdown.',
    })
    if (!res) break
    if (res.attempts > 1) repaired = true
    best = res.value
    const gate = checkBlock(res.value, stageKind, { lessonType: opts.lessonType ?? 'rov' })
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

  if (!best) return null

  // Для video-блоков: вырезаем прямые URL из text (модель регулярно их выдумывает),
  // и добиваем videoSearchQuery, если она пустая/мусорная. Контекст fallback берётся из stream.ts.
  if (best.type === 'video' && opts.videoCtx) {
    const sanitizedText = sanitizeRutubeText(best.text)
    const query = extractOrFallbackQuery(
      { type: 'video', text: sanitizedText, videoSearchQuery: best.videoSearchQuery },
      opts.videoCtx,
    )
    best = { ...best, text: sanitizedText, videoSearchQuery: query }
  }

  return { value: best, repaired, accepted }
}
