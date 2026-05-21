import type { PiiMatch, PiiType } from './types'

// Каждый детектор возвращает совпадения по сырому тексту.
// Контрольные суммы СНИЛС/ИНН НЕ проверяем (по требованию CLAUDE.md/§6).

function collect(text: string, re: RegExp, type: PiiType): PiiMatch[] {
  const out: PiiMatch[] = []
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue
    out.push({ type, value: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}

// Совпадение по группе захвата (когда нужен контекст-префикс, который не входит в value).
function collectGroup(text: string, re: RegExp, type: PiiType, group: number): PiiMatch[] {
  const out: PiiMatch[] = []
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || m[group] === undefined) continue
    const value = m[group]
    const start = m.index + m[0].indexOf(value)
    out.push({ type, value, start, end: start + value.length })
  }
  return out
}

const PHONE = /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const SNILS = /\b\d{3}-\d{3}-\d{3}[\s-]?\d{2}\b/g
// Паспорт/ИНН/ДР — только рядом с контекстным словом. Группа 1 = само значение.
const PASSPORT_CTX = /паспорт[^\d]{0,15}(\d{4}\s?\d{6})/gi
const INN_CTX = /инн[^\d]{0,10}(\d{10,12})/gi
const DOB_CTX =
  /(?:д\.?\s?р\.?|дата|родил[ас]{1,2}ь?)[^\d]{0,20}(\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2})/gi
// Лидирующий lookbehind = граница слова (на кириллице \b ненадёжен): ключ не должен
// быть частью другого слова («рег-УЛ-ярное», «о-ПЕР-ативный»). Сокращения ул./пер./пр-кт.
// требуют точку, чтобы не ловить «улыбка», «переход», «первый».
const ADDRESS =
  /(?<![А-Яа-яёЁA-Za-z])(?:ул\.|улиц[аеы]|пр-?кт\.?|проспект|пер\.|переул(?:ок|ка|ке))[^,;.\n]{0,40}(?:,?\s*д\.?\s?\d+[а-я]?)?(?:,?\s*кв\.?\s?\d+)?/gi

export function detectPatterns(text: string): PiiMatch[] {
  return [
    ...collect(text, PHONE, 'phone'),
    ...collect(text, EMAIL, 'email'),
    ...collect(text, SNILS, 'snils'),
    ...collectGroup(text, PASSPORT_CTX, 'passport', 1),
    // ИНН детектим ТОЛЬКО в контексте слова «ИНН» — иначе ловит любые длинные числа
    // (номера кабинетов и т.п.).
    ...collectGroup(text, INN_CTX, 'inn', 1),
    ...collectGroup(text, DOB_CTX, 'dob', 1),
    ...collect(text, ADDRESS, 'address'),
  ]
}
