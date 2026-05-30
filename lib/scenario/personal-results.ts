import { type CanonicalDirection, type Direction, type Level, canonicalDirection } from './levels'

// PLACEHOLDER каталога личностных результатов из ФГОС НОО/ООО/СОО × 8 канонических направлений.
// Реальные дословные формулировки выписываются в Task 4 плана (приказы № 286/287/413+732).
// Сейчас в каждой ячейке — один заглушечный пункт, чтобы тесты структуры проходили
// и зависимый код не падал на пустом массиве. Между Task 2 и Task 4 продакшен не катится.
const PLACEHOLDER = 'TODO: формулировка из ФГОС'

export const CATALOG: Record<Level, Record<CanonicalDirection, string[]>> = {
  NOO: {
    Гражданское: [PLACEHOLDER],
    Патриотическое: [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    Эстетическое: [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    Трудовое: [PLACEHOLDER],
    Экологическое: [PLACEHOLDER],
    Познавательное: [PLACEHOLDER],
  },
  OOO: {
    Гражданское: [PLACEHOLDER],
    Патриотическое: [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    Эстетическое: [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    Трудовое: [PLACEHOLDER],
    Экологическое: [PLACEHOLDER],
    Познавательное: [PLACEHOLDER],
  },
  SOO: {
    Гражданское: [PLACEHOLDER],
    Патриотическое: [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    Эстетическое: [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    Трудовое: [PLACEHOLDER],
    Экологическое: [PLACEHOLDER],
    Познавательное: [PLACEHOLDER],
  },
}

export function getCatalog(level: Level, direction: Direction): string[] {
  return CATALOG[level][canonicalDirection(direction)]
}
