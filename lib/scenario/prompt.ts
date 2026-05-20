import type { GenerationInput } from './schema'

export const PROMPT_VERSION = 'v1-rag-2026-05-20'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type RagChunkForPrompt = { text: string; documentTitle: string; sectionKind: string }

export type SharedExampleForPrompt = { title: string; summary: string }

const SCHEMA_HINT = `Структура JSON (строго соблюдай ключи и типы):
{
  "title": string,
  "goals": string[],              // воспитательные результаты, 1-4 пункта
  "materials": string[],          // что нужно для занятия
  "stages": [                     // минимум 3 этапа: вовлечение, основная часть, рефлексия
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,     // целое, в минутах; сумма по этапам ≈ длительности занятия
      "activities": [
        {
          "type": "discussion" | "quiz" | "game" | "task" | "video",
          "text": string,
          "questions"?: string[]  // конкретные вопросы, не общие
        }
      ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}`

export function buildMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Генерируешь сценарии строго в формате JSON, без markdown-обёрток и пояснений.',
    'Правила: возрастная адаптация, активная роль детей, конкретные вопросы (не общие),',
    'указание ведущей роли педагога, обязательная рефлексия в конце.',
    'Никогда не используй реальные имён детей или персональные данные.',
    '',
    SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект по схеме. Никакого текста до или после.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся на эти фрагменты методичек, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег по похожим темам — ориентир по структуре, не копируй текст):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const user = [
    'Сгенерируй сценарий внеурочного занятия со следующими параметрами:',
    `- Направление воспитания: ${input.direction}`,
    `- Класс: ${input.grade}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    ...methodology,
    ...examples,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
