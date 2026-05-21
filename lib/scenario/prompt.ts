import { formatGradeForPrompt } from './options'
import type { GenerationInput, ScenarioSkeleton } from './schema'

export const PROMPT_VERSION = 'v4-spo-2026-05-21'

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
          "text": string,         // ГОТОВЫЙ к проведению текст: прямая речь учителя («Учитель: …») + конкретное содержание, НЕ «учитель рассказывает»
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
    'обязательная рефлексия в конце.',
    'ВАЖНО: в поле text давай ГОТОВЫЙ к проведению текст — прямую речь учителя',
    '(например «Учитель: Ребята, сегодня мы поговорим о…») и конкретное содержание',
    '(факты, формулировки, ход рассказа/беседы), достаточное, чтобы провести занятие,',
    'читая его. НЕ писать обобщения вида «учитель рассказывает» / «учитель объясняет».',
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
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
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

const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (СТРОГО только эти ключи, без details-полей):
{
  "title": string,
  "goals": string[],            // 1-4 воспитательных результата
  "stages": [                   // минимум 3 этапа: вовлечение, основная часть, рефлексия
    { "kind": "engage" | "main" | "reflection", "title": string, "duration_min": number }
  ]
}`

export function buildSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Сначала ты строишь только КАРКАС сценария: название, цели и список этапов с длительностью.',
    'Отвечаешь строго JSON, без markdown и пояснений. Без реальных имён детей.',
    '',
    SKELETON_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект каркаса. Сумма duration_min ≈ длительности занятия.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (ориентир по структуре, не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []
  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег — ориентир по структуре):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const user = [
    'Построй каркас сценария внеурочного занятия:',
    `- Направление воспитания: ${input.direction}`,
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
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

export function buildDetailsMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  ragChunks: RagChunkForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Тебе дан готовый каркас сценария. Заполни его деталями, СОХРАНИВ названия этапов,',
    'их порядок и длительность (duration_min). Добавь materials, activities (с конкретными',
    'вопросами, не общими) и adaptations. Активная роль детей, обязательная рефлексия.',
    'ВАЖНО: в поле text давай ГОТОВЫЙ к проведению текст — прямую речь учителя',
    '(например «Учитель: Ребята, сегодня мы поговорим о…») и конкретное содержание',
    '(факты, формулировки, ход рассказа/беседы), достаточное, чтобы провести занятие,',
    'читая его. НЕ писать обобщения вида «учитель рассказывает» / «учитель объясняет».',
    'Опирайся на стиль и факты из методичек ниже, но не копируй дословно.',
    'Отвечаешь строго JSON по полной схеме, без markdown. Без реальных имён детей.',
    '',
    SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект по полной схеме.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся, но не копируй):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const user = [
    'Заполни деталями этот каркас сценария:',
    JSON.stringify(skeleton),
    '',
    `Параметры: направление ${input.direction}, ${formatGradeForPrompt(input.grade)}, тема «${input.topic}», ${input.durationMin} минут, формат ${input.format}.`,
    ...methodology,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
