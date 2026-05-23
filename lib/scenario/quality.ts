import type { ScenarioContent } from './schema'

// Детерминированный гейт качества блоков и сценария. Без LLM-вызовов:
// объективные пороги, которые перегенерируют тонкие блоки и помечают слабый сценарий.

const MIN_BLOCK_CHARS = Number(process.env.MIN_BLOCK_CHARS ?? 600)
const MIN_SCENARIO_CHARS = Number(process.env.MIN_SCENARIO_CHARS ?? 9000)

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

  const teacherTurns = (text.match(/Учитель\s*:/g) ?? []).length
  if ((stageKind === 'engage' || stageKind === 'main') && teacherTurns < 2) {
    reasons.push('мало реплик «Учитель:» (нужно ≥2)')
  }

  if (block.type === 'discussion' && (block.questions?.length ?? 0) < 3) {
    reasons.push('мало вопросов для обсуждения (нужно ≥3)')
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

  return { warnings }
}
