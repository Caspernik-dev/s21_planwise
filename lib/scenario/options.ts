export const DIRECTIONS = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
  'Семейные ценности',
  'Профориентация',
  'Здоровый образ жизни',
] as const

export const FORMATS = [
  'классный час',
  'беседа',
  'квиз',
  'игра',
  'мастерская',
  'киноклуб',
  'дебаты',
  'проектная сессия',
] as const

export const DURATIONS = [20, 30, 40, 60] as const

export const SPO_GRADE = 12

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, SPO_GRADE] as const

export function formatGrade(grade: number): string {
  return grade === SPO_GRADE ? 'СПО' : `${grade} класс`
}

export function formatGradeForPrompt(grade: number): string {
  return grade === SPO_GRADE
    ? 'обучающиеся СПО (среднее профессиональное образование)'
    : `${grade} класс`
}

export type Direction = (typeof DIRECTIONS)[number]
export type Format = (typeof FORMATS)[number]
