import type { ScenarioContent } from './schema'

// Детерминированный гейт качества блоков и сценария. Без LLM-вызовов:
// объективные пороги, которые перегенерируют тонкие блоки и помечают слабый сценарий.

const MIN_BLOCK_CHARS = Number(process.env.MIN_BLOCK_CHARS ?? 600)
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
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const text = block.text.trim()
  if (text.length < MIN_BLOCK_CHARS) reasons.push('слишком короткий текст блока')

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

  return { ok: reasons.length === 0, reasons }
}

const significantWords = (s: string): string[] => s.toLowerCase().match(/[а-яёa-z]{5,}/g) ?? []

export function checkScenario(content: ScenarioContent): { warnings: string[] } {
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

  return { warnings }
}
