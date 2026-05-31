import type { Direction } from './options'

// Каталог 17 ценностей российского общества из Указа Президента РФ
// от 09.11.2022 № 809 «Об утверждении Основ государственной политики
// по сохранению и укреплению традиционных российских духовно-нравственных
// ценностей» (в ред. от 04.03.2026).
export const VALUES_809 = [
  'жизнь',
  'достоинство',
  'права и свободы человека',
  'патриотизм',
  'гражданственность',
  'служение Отечеству и ответственность за его судьбу',
  'высокие нравственные идеалы',
  'крепкая семья',
  'созидательный труд',
  'приоритет духовного над материальным',
  'гуманизм',
  'милосердие',
  'справедливость',
  'коллективизм',
  'взаимопомощь и взаимоуважение',
  'историческая память и преемственность поколений',
  'единство народов России',
] as const

export type Value809 = (typeof VALUES_809)[number]

const VALUES_809_SET = new Set<string>(VALUES_809)

// Fallback: ведущая ценность по направлению воспитания,
// когда LLM не вернула валидную из каталога.
export const DIRECTION_TO_LEADING_VALUE: Record<Direction, Value809> = {
  Гражданское: 'гражданственность',
  Патриотическое: 'патриотизм',
  'Духовно-нравственное': 'высокие нравственные идеалы',
  Эстетическое: 'высокие нравственные идеалы',
  'Физическое и здоровье': 'жизнь',
  Трудовое: 'созидательный труд',
  Экологическое: 'жизнь',
  Познавательное: 'высокие нравственные идеалы',
  'Адаптация к изменяющимся условиям': 'достоинство',
  'Семейные ценности': 'крепкая семья',
  Профориентация: 'созидательный труд',
  'Здоровый образ жизни': 'жизнь',
}

export function selectValues(
  input: { leadingValue?: unknown; secondaryValues?: unknown; valueFormulations?: unknown },
  direction: Direction | undefined,
): {
  leadingValue: Value809
  secondaryValues: Value809[]
  valueFormulations: { text: string; basedOn: Value809 }[]
} {
  // 1. leadingValue
  const leading: Value809 =
    typeof input.leadingValue === 'string' && VALUES_809_SET.has(input.leadingValue)
      ? (input.leadingValue as Value809)
      : direction !== undefined
        ? DIRECTION_TO_LEADING_VALUE[direction]
        : // аварийный fallback: ни валидной ведущей, ни направления — первая из 17 («жизнь»).
          // На штатных путях `direction` всегда задан, сюда попадаем только при ручном вызове без него.
          VALUES_809[0]

  // 2. secondaryValues
  const rawSecondary = Array.isArray(input.secondaryValues) ? input.secondaryValues : []
  const seen = new Set<Value809>()
  const secondary: Value809[] = []
  for (const item of rawSecondary) {
    if (
      typeof item === 'string' &&
      VALUES_809_SET.has(item) &&
      item !== leading &&
      !seen.has(item as Value809)
    ) {
      seen.add(item as Value809)
      secondary.push(item as Value809)
    }
  }

  // 3. valueFormulations
  const rawFormulations = Array.isArray(input.valueFormulations) ? input.valueFormulations : []
  const formulations: { text: string; basedOn: Value809 }[] = []
  for (const item of rawFormulations) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).text === 'string' &&
      typeof (item as Record<string, unknown>).basedOn === 'string' &&
      VALUES_809_SET.has((item as Record<string, unknown>).basedOn as string)
    ) {
      const text = ((item as Record<string, unknown>).text as string).trim()
      if (text.length > 0) {
        formulations.push({ text, basedOn: (item as Record<string, unknown>).basedOn as Value809 })
      }
    }
  }

  return {
    leadingValue: leading,
    secondaryValues: secondary.slice(0, 3),
    valueFormulations: formulations.slice(0, 8),
  }
}
