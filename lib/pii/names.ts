import namesData from './names.json'
import type { PiiMatch } from './types'

const FIRST_NAMES = new Set<string>(namesData.firstNames)

const CAP_WORD = '[А-ЯЁ][а-яё]+'
// JS `\b` — только ASCII и не работает на кириллице, поэтому используем
// lookaround-границы по русскому алфавиту.
const RU = '[А-ЯЁа-яё]'
const WB_START = `(?<!${RU})`
const WB_END = `(?!${RU})`
// Суффиксы фамилий.
const SURNAME = new RegExp(
  `${CAP_WORD}(?:ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая|енко|ко|ук|юк)${WB_END}`,
)
const FIRST_SURNAME = new RegExp(`${WB_START}(${CAP_WORD})\\s+(${SURNAME.source})`, 'g')
// Полное ФИО с отчеством: -ович/-евич/-ьич (м), -овна/-евна/-ична/-инична (ж).
const FULL_WITH_PATRONYMIC = new RegExp(
  `(?:${CAP_WORD}\\s+)?${CAP_WORD}\\s+[А-ЯЁ][а-яё]+(?:ович|евич|ьич|овна|евна|инична|ична)${WB_END}`,
  'g',
)

export function detectNames(text: string): PiiMatch[] {
  const out: PiiMatch[] = []

  // 1. Полное ФИО с отчеством (самый сильный сигнал).
  for (const m of text.matchAll(FULL_WITH_PATRONYMIC)) {
    if (m.index !== undefined)
      out.push({ type: 'name', value: m[0], start: m.index, end: m.index + m[0].length })
  }

  // 2. Имя из словаря + Фамилия по суффиксу.
  for (const m of text.matchAll(FIRST_SURNAME)) {
    if (m.index === undefined) continue
    if (FIRST_NAMES.has(m[1])) {
      out.push({ type: 'name', value: m[0], start: m.index, end: m.index + m[0].length })
    }
  }

  // 3. Одиночное распространённое имя (если ещё не покрыто более длинным матчем).
  const covered = (i: number) => out.some((x) => i >= x.start && i < x.end)
  for (const m of text.matchAll(new RegExp(`${WB_START}(${CAP_WORD})${WB_END}`, 'g'))) {
    if (m.index === undefined) continue
    if (FIRST_NAMES.has(m[1]) && !covered(m.index)) {
      out.push({ type: 'name', value: m[1], start: m.index, end: m.index + m[1].length })
    }
  }

  return out
}
