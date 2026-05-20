export const DIRECTIONS = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
] as const

export const FORMATS = ['классный час', 'беседа', 'квиз', 'игра', 'мастерская'] as const

export const DURATIONS = [20, 30, 45] as const

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

export type Direction = (typeof DIRECTIONS)[number]
export type Format = (typeof FORMATS)[number]
