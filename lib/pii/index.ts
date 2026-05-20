import { anonymize } from './anonymize'
import { detectPII } from './detect'
import type { AnonymizeResult, PiiMatch } from './types'

export type { PiiMatch, PiiType, AnonymizeResult } from './types'
export { detectPII } from './detect'
export { anonymize } from './anonymize'

export interface PiiReport {
  original: string
  anonymized: string
  matches: PiiMatch[]
  replacements: AnonymizeResult['replacements']
}

export function detectAndAnonymize(text: string): PiiReport {
  const matches = detectPII(text)
  const { text: anonymized, replacements } = anonymize(text, matches)
  return { original: text, anonymized, matches, replacements }
}
