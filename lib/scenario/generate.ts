import { chatCompletion } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { normalizeChronometry } from './normalize'
import { PROMPT_VERSION, buildMessages } from './prompt'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  scenarioContentSchema,
} from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type GenerateDeps = { chat?: ChatFn }

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
    const obj = extractJson(raw)
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
      return { model: process.env.GIGACHAT_MODEL ?? 'GigaChat' }
    }
  })()

  const started = Date.now()
  const messages = buildMessages(input)

  const first = await chat(messages, { temperature: 0.4 })
  let usage = first.usage
  let parsed = tryParse(first.content)
  let repaired = false

  if (!parsed) {
    repaired = true
    const repairMessages: GigaMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content:
          'Ответ был невалидным. Верни ТОЛЬКО валидный JSON-объект строго по описанной схеме, без markdown и пояснений.',
      },
    ]
    const second = await chat(repairMessages, { temperature: 0.2 })
    usage = second.usage ?? usage
    parsed = tryParse(second.content)
  }

  if (!parsed) {
    throw new Error('GigaChat вернул невалидный сценарий после repair-попытки')
  }

  const { content, changed } = normalizeChronometry(parsed, input.durationMin)

  const meta: GenerationMeta = {
    model: cfg.model,
    promptVersion: PROMPT_VERSION,
    repaired,
    normalized: changed,
    usage,
    latencyMs: Date.now() - started,
  }

  return { content, meta }
}
