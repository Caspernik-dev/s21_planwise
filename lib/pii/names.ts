import namesData from './names.json'
import type { PiiMatch } from './types'

const FIRST_NAMES = new Set<string>(namesData.firstNames)

function buildNameForms(name: string): string[] {
  const forms = new Set<string>([name])

  // Спецслучаи
  if (name === 'Пётр') {
    forms.add('Петра')
    forms.add('Петру')
    forms.add('Петром')
    forms.add('Петре')
    return [...forms]
  }

  if (name === 'Лев') {
    forms.add('Льва')
    forms.add('Льву')
    forms.add('Львом')
    forms.add('Льве')
    return [...forms]
  }

  if (name === 'Илья') {
    forms.add('Ильи')
    forms.add('Илье')
    forms.add('Илью')
    forms.add('Ильёй')
    return [...forms]
  }

  if (name === 'Любовь') {
    forms.add('Любови')
    forms.add('Любовью')
    return [...forms]
  }

  // Имена на -а
  if (name.endsWith('а')) {
    const stem = name.slice(0, -1)
    forms.add(`${stem}ы`)
    forms.add(`${stem}и`)
    forms.add(`${stem}е`)
    forms.add(`${stem}у`)
    forms.add(`${stem}ой`)
    forms.add(`${stem}ою`)
    forms.add(`${stem}ей`)
  }

  // Имена на -я
  if (name.endsWith('я')) {
    const stem = name.slice(0, -1)
    forms.add(`${stem}и`)
    forms.add(`${stem}е`)
    forms.add(`${stem}ю`)
    forms.add(`${stem}ей`)
    forms.add(`${stem}ею`)
  }

  // Имена на согласную
  if (
    /[Б-ЯЁб-яё]$/u.test(name) &&
    !name.endsWith('а') &&
    !name.endsWith('я') &&
    !name.endsWith('ь')
  ) {
    forms.add(`${name}а`)
    forms.add(`${name}у`)
    forms.add(`${name}ом`)
    forms.add(`${name}е`)
  }

  // Имена на мягкий знак
  if (name.endsWith('ь')) {
    const stem = name.slice(0, -1)
    forms.add(`${stem}я`)
    forms.add(`${stem}ю`)
    forms.add(`${stem}ем`)
    forms.add(`${stem}е`)
    forms.add(`${stem}и`)
  }

  return [...forms]
}

const FIRST_NAME_FORMS = new Set<string>()
for (const name of FIRST_NAMES) {
  for (const form of buildNameForms(name)) {
    FIRST_NAME_FORMS.add(form)
  }
}

// Имена-омонимы частотных слов (вера/надежда/любовь/роман/лев): одиночно
// (без фамилии/отчества) НЕ детектим — иначе калечим сценарии о ценностях.
// В сильном контексте (правила 1 и 2) они по-прежнему ловятся.
const AMBIGUOUS_NAMES = ['Вера', 'Надежда', 'Любовь', 'Роман', 'Лев']
const AMBIGUOUS_NAME_FORMS = new Set<string>()
for (const name of AMBIGUOUS_NAMES) {
  for (const form of buildNameForms(name)) {
    AMBIGUOUS_NAME_FORMS.add(form)
  }
}

const CAP_WORD = '[А-ЯЁ][а-яё]+'

// JS `\\b` — только ASCII и не работает на кириллице, поэтому используем
// lookaround-границы по русскому алфавиту.
const RU = '[А-ЯЁа-яё]'
const WB_START = `(?<!${RU})`
const WB_END = `(?!${RU})`

// Базовые и частые косвенные формы фамилий.
const SURNAME = new RegExp(
  `[А-ЯЁ][а-яё]{1,}(?:` +
    [
      'ов',
      'ова',
      'ову',
      'овым',
      'ове',
      'ев',
      'ева',
      'еву',
      'евым',
      'еве',
      'ёв',
      'ёва',
      'ёву',
      'ёвым',
      'ёве',
      'ин',
      'ина',
      'ину',
      'иным',
      'ине',
      'ын',
      'ына',
      'ыну',
      'ыным',
      'ыне',

      // женские косвенные формы
      'овой',
      'евой',
      'иной',

      'ский',
      'ского',
      'скому',
      'ским',
      'ском',
      'ская',
      'ской',
      'скою',

      'цкий',
      'цкого',
      'цкому',
      'цким',
      'цком',
      'цкая',
      'цкой',
      'цкою',

      'енко',
      'ко',
      'ук',
      'юк',
    ].join('|') +
    `)${WB_END}`,
)

const FIRST_SURNAME = new RegExp(`${WB_START}(${CAP_WORD})\\s+(${SURNAME.source})`, 'g')

// Полное ФИО с отчеством: допускаем и некоторые косвенные формы отчества.
const FULL_WITH_PATRONYMIC = new RegExp(
  `(?:${CAP_WORD}\\s+)?${CAP_WORD}\\s+[А-ЯЁ][а-яё]+(?:ович|овича|овичу|овичем|овиче|евич|евича|евичу|евичем|евиче|ьич|ьича|ьичу|ьичем|ьиче|овна|овны|овне|овну|овной|евна|евны|евне|евну|евной|инична|иничны|иничне|иничну|иничной|ична|ичны|ичне|ичну|ичной)${WB_END}`,
  'g',
)

export function detectNames(text: string): PiiMatch[] {
  const out: PiiMatch[] = []

  // 1. Полное ФИО с отчеством (самый сильный сигнал).
  for (const m of text.matchAll(FULL_WITH_PATRONYMIC)) {
    if (m.index !== undefined) {
      out.push({ type: 'name', value: m[0], start: m.index, end: m.index + m[0].length })
    }
  }

  // 2. Имя (или его частая падежная форма) + фамилия.
  for (const m of text.matchAll(FIRST_SURNAME)) {
    if (m.index === undefined) continue
    if (FIRST_NAME_FORMS.has(m[1])) {
      out.push({ type: 'name', value: m[0], start: m.index, end: m.index + m[0].length })
    }
  }

  // 3. Одиночное распространённое имя или его частая падежная форма,
  // если ещё не покрыто более длинным матчем.
  const covered = (i: number) => out.some((x) => i >= x.start && i < x.end)
  for (const m of text.matchAll(new RegExp(`${WB_START}(${CAP_WORD})${WB_END}`, 'g'))) {
    if (m.index === undefined) continue
    if (FIRST_NAME_FORMS.has(m[1]) && !AMBIGUOUS_NAME_FORMS.has(m[1]) && !covered(m.index)) {
      out.push({ type: 'name', value: m[1], start: m.index, end: m.index + m[1].length })
    }
  }

  return out
}
