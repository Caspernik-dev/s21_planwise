import type { AnonymizeResult, PiiMatch, PiiType } from './types'

const LABELS: Record<PiiType, string> = {
  phone: 'Телефон',
  email: 'Email',
  snils: 'СНИЛС',
  passport: 'Паспорт',
  inn: 'ИНН',
  dob: 'ДатаРождения',
  address: 'Адрес',
  name: 'Имя',
}

// Детерминированно: одно и то же (тип+значение) → один и тот же плейсхолдер.
// Нумерация по типу, в порядке первого появления.
export function anonymize(text: string, matches: PiiMatch[]): AnonymizeResult {
  const sorted = [...matches].sort((a, b) => a.start - b.start)
  const counters: Partial<Record<PiiType, number>> = {}
  const assigned = new Map<string, string>() // `${type}::${value}` -> placeholder
  const replacements: AnonymizeResult['replacements'] = []

  for (const m of sorted) {
    const key = `${m.type}::${m.value}`
    if (!assigned.has(key)) {
      const n = (counters[m.type] ?? 0) + 1
      counters[m.type] = n
      const placeholder = `[${LABELS[m.type]}_${n}]`
      assigned.set(key, placeholder)
      replacements.push({ type: m.type, original: m.value, placeholder })
    }
  }

  // Заменяем справа налево, чтобы не сбивать индексы.
  let out = text
  for (const m of [...sorted].reverse()) {
    const placeholder = assigned.get(`${m.type}::${m.value}`)
    if (placeholder === undefined) continue
    out = out.slice(0, m.start) + placeholder + out.slice(m.end)
  }

  return { text: out, replacements }
}
