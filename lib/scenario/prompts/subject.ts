import { formatGradeForPrompt } from '../options'
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

export const PROMPT_VERSION = 'v1-subject-2026-05-30'

function buildSystemPrompt(input: GenerationInput): string {
  return `Ты — методист предметного внеурочного занятия. Занятие — углубление, опыт, проект или олимпиадная задача по школьному предмету.

Предмет: ${input.subject ?? ''}.

Жанровые рамки:
- Это НЕ урок, а внеурочное занятие — поверх программы предмета (расширение, углубление, проектная или исследовательская работа).
- Структура: гипотеза/задача → план работы → выполнение (эксперимент/исследование/решение) → обсуждение результата → перенос/обобщение.
- Главный «выход» — предметные результаты (что научились делать, что измерили, что открыли) — поле subjectResults обязательно.
- Видеовход НЕ обязателен.
- НЕ выдумывай конкретику опытов (точные параметры, цифры, реактивы) без опоры на материалы — описывай МЕТОДОЛОГИЮ, конкретику пусть учитель уточнит.
- Отметки не выставляются.

${RULE_NO_HALLUCINATIONS}
${RULE_NO_GRADING}

${JSON_FORMAT_HINT}`
}

const SKELETON_HINT = `Верни JSON каркаса со структурой:
{
  "title": string,
  "goals": string[],             // 2-3 цели — что научится делать / что исследует / что откроет
  "materials": string[],
  "subjectResults": string[],    // ОБЯЗАТЕЛЬНО ≥2 пункта: что научились делать, что измерили, что открыли — конкретные предметные результаты
  "stages": [
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      "blocks": [ { "type": "task"|"discussion"|"quiz", "focus": string } ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}

НЕ используй поля personalResults / values / coreMeanings — они для занятий «Разговоры о важном».
subjectResults обязателен и должен содержать не менее 2 пунктов (конкретные результаты: что умеет делать / что узнал / что измерил обучающийся после занятия).
`

const BLOCK_HINT = `Верни JSON ОДНОЙ активности:
{
  "type": "task" | "discussion" | "quiz",
  "text": string,              // подробное описание (≥300 символов): конкретные шаги исследования/эксперимента/задачи с явными действиями учителя и учеников; методология без выдуманных точных параметров
  "questions": string[]        // опц., вопросы для обсуждения результатов если type === "discussion"
}
`

export function buildSubjectSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const user = [
    'Построй каркас предметного внеурочного занятия:',
    `- Тема: ${input.topic}`,
    `- Класс: ${formatGradeForPrompt(input.grade)}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    `- Предмет: ${input.subject ?? ''}`,
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

export function buildSubjectBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
  const user = [
    `Предметное внеурочное занятие: «${skeleton.title}». Тема «${input.topic}», ${formatGradeForPrompt(input.grade)}, предмет ${input.subject ?? ''}, формат ${input.format}.`,
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
