import { type LessonType, type LiteracyKind, formatGrade, literacyKindLabel } from './options'

export interface EmbedQueryInput {
  lessonType: LessonType
  topic: string
  grade: number
  format: string
  direction?: string
  subject?: string
  literacyKind?: LiteracyKind
}

export function buildEmbedQuery(input: EmbedQueryInput): string {
  const parts: string[] = []
  if (input.lessonType === 'subject_extension' && input.subject) {
    parts.push(input.subject)
  }
  if (input.lessonType === 'literacy' && input.literacyKind) {
    parts.push(literacyKindLabel(input.literacyKind))
  }
  if (input.direction) {
    parts.push(input.direction)
  }
  parts.push(input.topic, formatGrade(input.grade), input.format)
  return parts.filter(Boolean).join(' ')
}
