import { type LiteracyKind, literacyKindLabel } from './options'
import type { GenerationInput } from './schema'

/**
 * Вычисляет значение колонки `scenarios.direction` на основе типа занятия.
 *
 * - rov / event: берём direction из input (воспитательное направление)
 * - subject_extension: subject (название предмета — физика, математика…)
 * - literacy: лейбл вида грамотности (e.g. «Математическая грамотность»)
 * - krujok: «—» (нет воспитательного направления)
 */
export function scenarioDirectionValue(
  input: Pick<GenerationInput, 'lessonType' | 'direction' | 'subject' | 'literacyKind'>,
): string {
  if (input.lessonType === 'subject_extension' && input.subject) return input.subject
  if (input.lessonType === 'literacy' && input.literacyKind) {
    return literacyKindLabel(input.literacyKind as LiteracyKind)
  }
  if (input.lessonType === 'krujok') return '—'
  return input.direction ?? ''
}
