import { detectAndAnonymize } from '@/lib/pii'

export function prepareMaterial(
  rawText: string,
  consent: boolean,
): { text: string; anonymized: boolean; piiCount: number } {
  if (consent) return { text: rawText, anonymized: false, piiCount: 0 }
  const report = detectAndAnonymize(rawText)
  return { text: report.anonymized, anonymized: true, piiCount: report.replacements.length }
}
