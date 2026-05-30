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

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function validateAgainstCatalog(items: string[], catalog: string[]): string[] {
  const catalogNormed = new Set(catalog.map(norm))
  return items.map(norm).filter((s) => catalogNormed.has(s))
}

const MIN = 3
const MAX = 5

export function selectPersonalResults(items: string[] | undefined, catalog: string[]): string[] {
  const valid = validateAgainstCatalog(items ?? [], catalog)
  const deduped: string[] = []
  for (const s of valid) {
    if (!deduped.includes(s)) deduped.push(s)
  }
  if (deduped.length >= MIN) return deduped.slice(0, MAX)
  const need = MIN - deduped.length
  const fallback = catalog
    .map(norm)
    .filter((s) => !deduped.includes(s))
    .slice(0, need)
  return [...deduped, ...fallback]
}
