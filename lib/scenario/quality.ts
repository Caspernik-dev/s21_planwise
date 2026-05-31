import type { LessonType } from './options'
import type { ScenarioContent } from './schema'

// Детерминированный гейт качества блоков и сценария. Без LLM-вызовов:
// объективные пороги, которые перегенерируют тонкие блоки и помечают слабый сценарий.

const MIN_BLOCK_CHARS = Number(process.env.MIN_BLOCK_CHARS ?? 600)
const MIN_STEP_CHARS = Number(process.env.MIN_STEP_CHARS ?? 200)
const MIN_SCENARIO_CHARS = Number(process.env.MIN_SCENARIO_CHARS ?? 9000)
const MIN_TEACHER_TURN_CHARS = Number(process.env.MIN_TEACHER_TURN_CHARS ?? 40)
const MIN_QUESTION_CHARS = Number(process.env.MIN_QUESTION_CHARS ?? 15)

export type BlockForCheck = {
  type: string
  text: string
  questions?: string[]
}

export function checkBlock(
  block: BlockForCheck,
  stageKind: string,
  opts?: { lessonType?: LessonType; minBlockChars?: number; minStepChars?: number },
): { ok: boolean; reasons: string[] } {
  const lessonType = opts?.lessonType ?? 'rov'
  const isStrict = lessonType === 'rov' || lessonType === 'event'

  const minChars = isStrict
    ? (opts?.minBlockChars ?? MIN_BLOCK_CHARS)
    : (opts?.minStepChars ?? MIN_STEP_CHARS)

  const reasons: string[] = []
  const text = block.text.trim()
  if (text.length < minChars) reasons.push('слишком короткий текст блока')

  if (isStrict) {
    const isLed = stageKind === 'engage' || stageKind === 'main'
    // Реплики «Учитель:» — содержимое после каждого маркера (преамбулу [0] отбрасываем).
    const turns = text
      .split(/Учитель\s*:/)
      .slice(1)
      .map((t) => t.trim())
    if (isLed && turns.length < 2) {
      reasons.push('мало реплик «Учитель:» (нужно ≥2)')
    }
    if (isLed && turns.some((t) => t.length < MIN_TEACHER_TURN_CHARS)) {
      reasons.push('пустая или слишком короткая реплика «Учитель:»')
    }

    if (block.type === 'discussion') {
      const qs = block.questions ?? []
      if (qs.length < 3) reasons.push('мало вопросов для обсуждения (нужно ≥3)')
      if (qs.some((q) => !q.includes('?') || q.trim().length < MIN_QUESTION_CHARS)) {
        reasons.push('слишком короткий или неполный вопрос')
      }
    }
  } else {
    // Мягкий путь (krujok/literacy/subject_extension): хотя бы один маркер прямой речи или шага —
    // защита от «учитель спрашивает / учитель предлагает» в пересказе. Промпт уже это требует;
    // гейт перегенерирует блок, если LLM сорвался в нарратив.
    const isLed = stageKind === 'engage' || stageKind === 'main'
    if (isLed && !/(Учитель\s*:|Шаг\s*\d+\s*:|Кейс\s*:)/.test(text)) {
      reasons.push('нет прямой речи учителя или шагов — блок написан пересказом')
    }
  }

  return { ok: reasons.length === 0, reasons }
}

const significantWords = (s: string): string[] => s.toLowerCase().match(/[а-яёa-z]{5,}/g) ?? []

export function checkScenario(
  content: ScenarioContent,
  opts?: { lessonType?: LessonType; grade?: number; durationMin?: number },
): { warnings: string[] } {
  const warnings: string[] = []

  const total = JSON.stringify(content).length
  if (total < MIN_SCENARIO_CHARS) {
    warnings.push(`общий объём ниже ожидаемого (${total} симв.)`)
  }

  const titles = content.stages.map((s) => s.title.trim().toLowerCase())
  if (new Set(titles).size < titles.length) {
    warnings.push('дублирующиеся заголовки этапов')
  }

  const body = content.stages
    .flatMap((s) => s.activities.map((a) => a.text))
    .join(' ')
    .toLowerCase()
  for (const m of content.coreMeanings ?? []) {
    const words = significantWords(m)
    if (words.length > 0 && !words.some((w) => body.includes(w))) {
      warnings.push(`смысл не раскрыт в ходе занятия: «${m.slice(0, 40)}…»`)
    }
  }

  const reflectionStages = content.stages.filter((s) => s.kind === 'reflection')
  if (reflectionStages.length === 0) {
    warnings.push('В сценарии нет этапа рефлексии (заключительная часть)')
  }
  for (const stage of reflectionStages) {
    const hasQuestions = stage.activities.some(
      (a) => (a.questions?.length ?? 0) > 0 || a.text.includes('?'),
    )
    if (!hasQuestions) {
      warnings.push('В этапе рефлексии нет вопросов для обратной связи')
    }
  }

  // Физкультминутка — нормативное требование СП 2.4.3648-20 п. 2.10.3
  if (opts?.grade !== undefined && opts.grade <= 4 && (opts.durationMin ?? 0) >= 40) {
    const allText = content.stages
      .flatMap((s) => s.activities.map((a) => a.text))
      .join(' ')
      .toLowerCase()
    if (!/физкульт|двигат|встань|разминк/.test(allText)) {
      warnings.push(
        'Для начальной школы на занятии 40+ мин нормативно требуется физкультминутка (СП 2.4.3648-20 п. 2.10.3)',
      )
    }
  }

  return { warnings }
}
