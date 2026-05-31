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
  | 'Адаптация'

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
  'Адаптация к изменяющимся условиям': 'Адаптация',
  'Семейные ценности': 'Духовно-нравственное',
  Профориентация: 'Трудовое',
  'Здоровый образ жизни': 'Физическое и здоровье',
}

export type RovGroup = '1-2' | '3-4' | '5-7' | '8-9' | '10-11' | 'СПО'

export function gradeToRovGroup(grade: number): RovGroup {
  if (grade === 12) return 'СПО'
  if (grade <= 2) return '1-2'
  if (grade <= 4) return '3-4'
  if (grade <= 7) return '5-7'
  if (grade <= 9) return '8-9'
  return '10-11'
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

const ROV_GROUP_LABEL: Record<RovGroup, string> = {
  '1-2': '1–2 классы',
  '3-4': '3–4 классы',
  '5-7': '5–7 классы',
  '8-9': '8–9 классы',
  '10-11': '10–11 классы',
  СПО: 'СПО',
}

export function rovGroupLabel(grade: number): string {
  return ROV_GROUP_LABEL[gradeToRovGroup(grade)]
}
