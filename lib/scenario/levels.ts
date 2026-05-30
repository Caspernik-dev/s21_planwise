import type { DIRECTIONS } from './options'

export type Level = 'NOO' | 'OOO' | 'SOO'

export type Direction = (typeof DIRECTIONS)[number]

export type CanonicalDirection =
  | 'Гражданское'
  | 'Патриотическое'
  | 'Духовно-нравственное'
  | 'Эстетическое'
  | 'Физическое и здоровье'
  | 'Трудовое'
  | 'Экологическое'
  | 'Познавательное'

export function gradeToLevel(grade: number): Level {
  if (grade <= 4) return 'NOO'
  if (grade <= 9) return 'OOO'
  return 'SOO' // 10, 11, 12 (СПО)
}

const DIRECTION_MAP: Record<Direction, CanonicalDirection> = {
  Гражданское: 'Гражданское',
  Патриотическое: 'Патриотическое',
  'Духовно-нравственное': 'Духовно-нравственное',
  Эстетическое: 'Эстетическое',
  'Физическое и здоровье': 'Физическое и здоровье',
  Трудовое: 'Трудовое',
  Экологическое: 'Экологическое',
  Познавательное: 'Познавательное',
  'Семейные ценности': 'Духовно-нравственное',
  Профориентация: 'Трудовое',
  'Здоровый образ жизни': 'Физическое и здоровье',
}

export function canonicalDirection(direction: Direction): CanonicalDirection {
  return DIRECTION_MAP[direction]
}

const LEVEL_LABEL: Record<Level, string> = {
  NOO: 'НОО',
  OOO: 'ООО',
  SOO: 'СОО',
}

export function levelLabel(level: Level): string {
  return LEVEL_LABEL[level]
}
