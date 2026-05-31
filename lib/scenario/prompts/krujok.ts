import { gradeToLevel } from '../levels'
import { buildMetaCatalogSection, getMetaCatalog } from '../meta-results'
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

export const PROMPT_VERSION = 'v10-uud-2026-05-31'

const SYSTEM_KRUJOK = `Ты — методист, помогаешь учителю придумать занятие тематического кружка / клуба по интересам.

Жанровые рамки:
- Это НЕ урок и НЕ «Разговоры о важном». Структура свободная, обязательной трёхчастности нет.
- Видеовход НЕ обязателен — включай видео или демонстрацию только если оно естественно ложится в тему.
- Главный «выход» занятия — развитие интереса и/или конкретное практическое умение, а не личностные результаты ФГОС.
- Формы: мастер-класс, творческая мастерская, игра, проект, дискуссия, показ — выбирай под тему.
- Активности подробные, с пошаговым описанием действий учителя и учеников.
- Пиши блоки ПРЯМОЙ РЕЧЬЮ: "Учитель: ..." — конкретные реплики, которые учитель проговаривает дословно. Для практических действий допускается "Шаг 1: ...", "Шаг 2: ...". НЕ ПЕРЕСКАЗЫВАЙ в третьем лице ("учитель спрашивает", "учитель предлагает") — это водянисто и не даёт готовый к проведению сценарий.

${RULE_NO_HALLUCINATIONS}
${RULE_NO_GRADING}

${JSON_FORMAT_HINT}
`

const SKELETON_HINT = `Верни JSON каркаса со структурой:
{
  "title": string,
  "goals": string[],            // 2-3 цели — что научится делать / что узнает
  "materials": string[],
  "subjectResults": string[],   // опц., что научились делать (конкретные умения)
  "metaSubjectResults": {
    "cognitive": string[],   // 1-2 ДОСЛОВНЫХ из [META_RESULTS_CATALOG] Познавательные
    "communicative": string[], // 1-2 ДОСЛОВНЫХ → Коммуникативные
    "regulatory": string[]    // 1-2 ДОСЛОВНЫХ → Регулятивные
  },
  "stages": [
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      "blocks": [ { "type": "discussion"|"quiz"|"game"|"task"|"video", "focus": string } ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}

НЕ используй поля personalResults / values / coreMeanings — они для занятий «Разговоры о важном».
`

const BLOCK_HINT = `Верни JSON ОДНОЙ активности:
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  "text": string,             // подробное практическое описание шагов (≥300 символов), допускается «Шаг 1: ...», «Учитель: ...» — на твой выбор по теме
  "questions": string[]       // опц., вопросы для обсуждения если type === "discussion"
}
`

export function buildKrujokSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
  const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
  const metaCatalogBlock = buildMetaCatalogSection(metaCatalog)

  const user = [
    'Построй каркас занятия тематического кружка:',
    `- Тема: ${input.topic}`,
    `- Класс: ${formatGradeForPrompt(input.grade)}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    buildMaterialBlock(userMaterial),
    buildMethodologyBlock(ragChunks),
    buildGoodExamplesBlock(sharedExamples),
    ...metaCatalogBlock,
    '',
    SKELETON_HINT,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: SYSTEM_KRUJOK },
    { role: 'user', content: user },
  ]
}

export function buildKrujokBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
  const user = [
    `Занятие кружка: «${skeleton.title}». Тема «${input.topic}», ${formatGradeForPrompt(input.grade)}, формат ${input.format}.`,
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
    { role: 'system', content: SYSTEM_KRUJOK },
    { role: 'user', content: user },
  ]
}
