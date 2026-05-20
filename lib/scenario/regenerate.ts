import { chatCompletion } from '@/lib/gigachat/client'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import type { ChatMessage, RagChunkForPrompt } from './prompt'
import { type ScenarioStage, activitySchema } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type RegenerateArgs = {
  scenario: { direction: string; grade: number; topic: string; format: string; title: string }
  stage: { kind: ScenarioStage['kind']; title: string }
  current: ScenarioStage['activities'][number]
}

const ACTIVITY_SCHEMA_HINT = `Структура JSON одной активности (строго ключи и типы):
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  "text": string,            // что делает педагог/дети, конкретно
  "questions"?: string[]     // конкретные вопросы, не общие
}`

export function buildActivityMessages(
  args: RegenerateArgs,
  ragChunks: RagChunkForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Тебе нужно предложить НОВЫЙ вариант ОДНОЙ активности занятия взамен текущей.',
    'Правила: возрастная адаптация, активная роль детей, конкретные вопросы (не общие).',
    'Никогда не используй реальные имена детей или персональные данные.',
    '',
    ACTIVITY_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект одной активности по схеме. Никакого текста до или после.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const user = [
    'Контекст занятия:',
    `- Направление: ${args.scenario.direction}`,
    `- Класс: ${args.scenario.grade}`,
    `- Тема: ${args.scenario.topic}`,
    `- Формат: ${args.scenario.format}`,
    `- Название сценария: ${args.scenario.title}`,
    `- Этап: «${args.stage.title}» (${args.stage.kind})`,
    '',
    'Текущая активность, которую нужно заменить на новый вариант:',
    `тип: ${args.current.type}`,
    `текст: ${args.current.text}`,
    ...(args.current.questions?.length ? [`вопросы: ${args.current.questions.join(' | ')}`] : []),
    ...methodology,
    '',
    'Сгенерируй другой по содержанию, но уместный вариант активности для этого этапа.',
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function extractJson(raw: string): unknown {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('JSON не найден')
  return JSON.parse(s.slice(start, end + 1))
}

function tryParse(raw: string) {
  try {
    return activitySchema.safeParse(extractJson(raw))
  } catch {
    return null
  }
}

export type RegenerateDeps = { chat?: ChatFn; ragChunks?: RagChunkForPrompt[] }

export async function regenerateActivity(args: RegenerateArgs, deps: RegenerateDeps = {}) {
  const chat = deps.chat ?? chatCompletion
  const messages = buildActivityMessages(args, deps.ragChunks ?? [])

  const first = await chat(messages, { temperature: 0.7 })
  let parsed = tryParse(first.content)

  if (!parsed?.success) {
    const repairMessages: GigaMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content:
          'Ответ был невалидным. Верни ТОЛЬКО валидный JSON одной активности по схеме, без markdown.',
      },
    ]
    const second = await chat(repairMessages, { temperature: 0.3 })
    parsed = tryParse(second.content)
  }

  if (!parsed?.success) throw new Error('GigaChat вернул невалидную активность после repair')
  return parsed.data
}
