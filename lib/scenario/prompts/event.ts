import { gradeToLevel, levelLabel } from '../levels'
import type { Direction } from '../levels'
import { buildMetaCatalogSection, getMetaCatalog } from '../meta-results'
import { formatGradeForPrompt } from '../options'
import { getCatalog, selectPersonalResults } from '../personal-results'
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

export const PROMPT_VERSION = 'v10-uud-2026-05-31'

const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (БЕЗ полного текста активностей — их распишут отдельно):
{
  "title": string,
  "goals": string[],            // 2-4 воспитательных результата
  "values": string[],           // формируемые ценности (1-3)
  "coreMeanings": string[],     // основные смыслы (3-4): ценностные тезисы по теме
  "personalResults": string[],  // 3-5 ДОСЛОВНЫХ формулировок из [PERSONAL_RESULTS_CATALOG]
  "metaSubjectResults": {
    "cognitive": string[],   // 1-2 ДОСЛОВНЫХ из [META_RESULTS_CATALOG] Познавательные
    "communicative": string[], // 1-2 ДОСЛОВНЫХ → Коммуникативные
    "regulatory": string[]    // 1-2 ДОСЛОВНЫХ → Регулятивные
  },
  "materials": string[],        // что нужно для занятия
  "adaptations": { "simpler": string, "harder": string },
  "stages": [                   // минимум 3 этапа: мотивация (engage), основная часть (main), итог/рефлексия (reflection)
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      "blocks": [ { "type": "discussion" | "quiz" | "game" | "task" | "video", "focus": string } ]
    }
  ]
}`

const BLOCK_SCHEMA_HINT = `Верни JSON ТОЛЬКО для ОДНОГО блока (одна активность):
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  "text": string,
  "questions"?: string[]
}`

function buildPersonalResultsBlock(input: GenerationInput): string {
  const direction = input.direction as Direction
  const level = gradeToLevel(input.grade)
  const items = getCatalog(level, direction)
  if (!items.length) return ''
  const catalog = items.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return [
    '',
    `[PERSONAL_RESULTS_CATALOG] (личностные результаты из ФГОС ${levelLabel(level)}, направление «${direction}»):`,
    catalog,
    '',
    `Из списка выше выбери ТОЛЬКО те формулировки (3-5), которые ПРЯМО связаны с темой «${input.topic}».`,
    'Критерий: формулировка должна описывать изменение в личности ученика, которое реально достигается этим занятием по этой теме.',
    'Если связь натянутая — НЕ ВЫБИРАЙ её. Лучше 3 точно подходящих, чем 5 случайных.',
    'Верни их ДОСЛОВНО, без правок и сокращений, в массиве "personalResults" каркаса.',
    'Не придумывай свои формулировки — только из этого списка.',
  ].join('\n')
}

const SYSTEM_EVENT = `Ты — методист воспитательной работы. Занятие — тематическое воспитательное мероприятие: классный час (не РоВ), праздник, КТД, тематический день.

Жанровые рамки:
- Это НЕ «Разговоры о важном» и НЕ урок — это работа классного руководителя по программе воспитания школы.
- Структура: мягкая трёхчастная — мотивация → основная часть → итог/рефлексия. Видеовход НЕ обязателен.
- Активности подробные, развёрнутые, с конкретными вопросами и заданиями.
- В поле text давай ПЛОТНЫЙ готовый ход: несколько реплик «Учитель: …» подряд (каждая 3-6 развёрнутых предложений) с конкретным содержанием + пометки «Ответы обучающихся.» там, где отвечают дети.
- НЕ ПИШИ обобщения «учитель рассказывает / объясняет» — ДАВАЙ дословную речь.
- ВОПРОСЫ — развёрнутые, разноуровневые, по 3-5 на обсуждение.

${RULE_NO_HALLUCINATIONS}
${RULE_NO_GRADING}

${JSON_FORMAT_HINT}`

export function buildEventSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const personalResultsBlock = buildPersonalResultsBlock(input)

  const system = [
    SYSTEM_EVENT,
    '',
    'Ты строишь КАРКАС: название, цели, ценности, основные смыслы, материалы, адаптации и этапы с длительностью.',
    'Активности на этом шаге НЕ пиши — только контент-план blocks для каждого этапа.',
    'Основная часть — 2-4 блока, мотивация и рефлексия — 1-2 блока.',
    'Отвечаешь строго JSON, без markdown. Без реальных имён детей.',
    ...(userMaterial.trim().length > 0
      ? [
          'Если дан [TEACHER_MATERIAL] — это ГЛАВНЫЙ источник содержания; строй каркас прежде всего на нём.',
        ]
      : []),
    '',
    SKELETON_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект каркаса. Сумма duration_min ≈ длительности занятия.',
  ].join('\n')

  const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
  const metaCatalogBlock = buildMetaCatalogSection(metaCatalog)

  const physMinuteBlock =
    input.grade <= 4 && input.durationMin >= 40
      ? [
          '',
          'Включи в середину занятия двигательную паузу (физкультминутка, тип "task", 2-3 минуты).',
          'Пример: Учитель: — Встаньте. Мы немного разомнёмся...',
        ]
      : []

  const user = [
    'Построй каркас сценария воспитательного мероприятия:',
    `- Направление воспитания: ${input.direction}`,
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    buildMaterialBlock(userMaterial),
    buildMethodologyBlock(ragChunks),
    buildGoodExamplesBlock(sharedExamples),
    personalResultsBlock,
    ...metaCatalogBlock,
    ...physMinuteBlock,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export function buildEventBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
  const stageRole =
    stage.kind === 'engage'
      ? 'мотивационный этап (эмоциональный старт, включение в тему)'
      : stage.kind === 'reflection'
        ? 'заключительный этап (итог, рефлексия)'
        : 'основная часть (раскрытие содержания, активное участие)'

  const system = [
    SYSTEM_EVENT,
    `Этап блока — ${stageRole}.`,
    'Распиши ПОДРОБНО ТОЛЬКО один блок. Раскрывай ИМЕННО фокус этого блока, не дублируй предыдущие.',
    ...(userMaterial.trim().length > 0
      ? ['Если дан [TEACHER_MATERIAL] — опирайся прежде всего на него.']
      : []),
    '',
    BLOCK_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект одного блока { "type": …, "text": …, "questions"?: … }.',
  ].join('\n')

  const meanings =
    skeleton.coreMeanings && skeleton.coreMeanings.length > 0
      ? [
          '',
          'Основные смыслы занятия (держи в уме, раскрывай уместные в этом блоке):',
          ...skeleton.coreMeanings.map((m) => `• ${m}`),
        ]
      : []

  const user = [
    `Занятие: «${skeleton.title}». Тема «${input.topic}», направление ${input.direction}, ${formatGradeForPrompt(input.grade)}, формат ${input.format}.`,
    `Этап: «${stage.title}» (${stage.kind}, ${stage.duration_min} мин).`,
    `Блок (${brief.type}): ${brief.focus}`,
    ...meanings,
    buildMaterialBlock(userMaterial),
    buildMethodologyBlock(ragChunks),
    ...(runningContext ? ['', runningContext] : []),
  ]
    .filter((s) => s !== '')
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Post-generation hook: applies ФГОС whitelist to personalResults field.
 * Call this after parseSkeleton, before per-block cycle — same pattern as rov.ts in stream.ts.
 */
export function applyPersonalResultsWhitelist(
  skeleton: ScenarioSkeleton,
  input: GenerationInput,
): ScenarioSkeleton {
  if (!input.direction) return skeleton
  const direction = input.direction as Direction
  const level = gradeToLevel(input.grade)
  const catalog = getCatalog(level, direction)
  return {
    ...skeleton,
    personalResults: selectPersonalResults(skeleton.personalResults, catalog),
  }
}
