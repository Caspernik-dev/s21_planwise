import { type LiteracyKind, formatGradeForPrompt, literacyKindLabel } from '../options'
import type { GenerationInput, ScenarioSkeleton } from '../schema'
import {
  JSON_FORMAT_HINT,
  RULE_NO_GRADING,
  RULE_NO_HALLUCINATIONS,
  buildGoodExamplesBlock,
  buildMaterialBlock,
  buildMethodologyBlock,
} from './shared'
import type { ChatMessage, RagChunkForPrompt, SharedExampleForPrompt } from './shared'

export type { ChatMessage, RagChunkForPrompt, SharedExampleForPrompt }

export const PROMPT_VERSION = 'v1-literacy-2026-05-30'

function buildSystemPrompt(input: GenerationInput): string {
  return `Ты — методист функциональной грамотности. Занятие — практикум, не урок.

Жанр: ${literacyKindLabel(input.literacyKind as LiteracyKind)} грамотность.

Жанровые рамки:
- Структура: краткое введение контекста → жизненный кейс-задача → разбор решения → перенос на похожий кейс → рефлексия умения.
- Опирайся на формат задач PISA/ФИОКО: реальный жизненный контекст, многошаговое решение, проверяемый результат.
- Главный «выход» — формируемое умение функциональной грамотности (поле subjectResults).
- Видеовход НЕ обязателен.
- Активности подробные, с конкретными примерами задач и вопросов для разбора кейса.
- Отметки не выставляются.

${RULE_NO_HALLUCINATIONS}
${RULE_NO_GRADING}

${JSON_FORMAT_HINT}`
}

const SKELETON_HINT = `Верни JSON каркаса со структурой:
{
  "title": string,
  "goals": string[],            // 2-3 цели — что научится делать / что узнает
  "materials": string[],
  "subjectResults": string[],   // ОБЯЗАТЕЛЬНО ≥2 пункта: что научились делать (конкретные формулируемые умения функциональной грамотности)
  "stages": [
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      "blocks": [ { "type": "discussion"|"quiz"|"task", "focus": string } ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}

НЕ используй поля personalResults / values / coreMeanings — они для занятий «Разговоры о важном».
subjectResults обязателен и должен содержать не менее 2 пунктов с формулировками умений (что умеет делать обучающийся после занятия).
`

const BLOCK_HINT = `Верни JSON ОДНОЙ активности:
{
  "type": "discussion" | "quiz" | "task",
  "text": string,             // подробное описание (≥300 символов): конкретная задача или кейс в стиле PISA/ФИОКО — реальный жизненный контекст, многошаговое решение, вопросы для разбора
  "questions": string[]       // опц., конкретные вопросы для разбора кейса если type === "discussion"
}
`

export function buildLiteracySkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const user = [
    'Построй каркас практикума функциональной грамотности:',
    `- Тема: ${input.topic}`,
    `- Класс: ${formatGradeForPrompt(input.grade)}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    `- Вид грамотности: ${literacyKindLabel(input.literacyKind as LiteracyKind)}`,
    buildMaterialBlock(userMaterial),
    buildMethodologyBlock(ragChunks),
    buildGoodExamplesBlock(sharedExamples),
    '',
    SKELETON_HINT,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: buildSystemPrompt(input) },
    { role: 'user', content: user },
  ]
}

export function buildLiteracyBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
  const user = [
    `Практикум функциональной грамотности: «${skeleton.title}». Тема «${input.topic}», ${formatGradeForPrompt(input.grade)}, ${literacyKindLabel(input.literacyKind as LiteracyKind)}, формат ${input.format}.`,
    `Этап: «${stage.title}» (${stage.kind}, ${stage.duration_min} мин).`,
    `Блок (${brief.type}): ${brief.focus}`,
    buildMaterialBlock(userMaterial),
    buildMethodologyBlock(ragChunks),
    ...(runningContext ? ['', runningContext] : []),
    '',
    BLOCK_HINT,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: buildSystemPrompt(input) },
    { role: 'user', content: user },
  ]
}
