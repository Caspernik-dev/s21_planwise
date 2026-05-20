import { detectPII } from '@/lib/pii'
import type { PiiType } from '@/lib/pii'
import type { ScenarioContent } from '@/lib/scenario/schema'

export type ScenarioPiiWarning = { kinds: PiiType[]; count: number }

/** Собирает весь текст сценария и мягко сканирует на ПДн. null — если чисто. */
export function scanScenarioPii(content: ScenarioContent): ScenarioPiiWarning | null {
  const parts: string[] = [content.title, ...content.goals, ...content.materials]
  for (const stage of content.stages) {
    parts.push(stage.title)
    for (const a of stage.activities) {
      parts.push(a.text)
      if (a.questions) parts.push(...a.questions)
    }
  }
  parts.push(content.adaptations.simpler, content.adaptations.harder)

  const matches = detectPII(parts.join('\n'))
  if (matches.length === 0) return null
  const kinds = Array.from(new Set(matches.map((m) => m.type)))
  return { kinds, count: matches.length }
}
