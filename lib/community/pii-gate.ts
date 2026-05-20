import { detectAndAnonymize, detectPII } from '@/lib/pii'
import type { PiiMatch } from '@/lib/pii'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { mapContentStrings, scenarioContentToText } from './serialize'

export function anonymizeContent(content: ScenarioContent): ScenarioContent {
  return mapContentStrings(content, (s) => detectAndAnonymize(s).anonymized)
}

export type StrictPiiResult =
  | { clean: true; anonymized: ScenarioContent }
  | { clean: false; remaining: PiiMatch[] }

export function strictPiiCheck(content: ScenarioContent): StrictPiiResult {
  const anonymized = anonymizeContent(content)
  const remaining = detectPII(scenarioContentToText(anonymized))
  if (remaining.length > 0) return { clean: false, remaining }
  return { clean: true, anonymized }
}
