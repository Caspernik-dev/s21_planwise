export type SectionKind = 'goal' | 'stage' | 'reflection' | 'materials' | 'other'

export type Chunk = {
  text: string
  sectionKind: SectionKind
  stageIdx?: number
}

const MIN_TOKENS = 300
const MAX_TOKENS = 800

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

// Колонтитулы PDF «Разговоров о важном», попадающие в текст при парсинге:
// «Методические рекомендации | 5−7 классы 1», «Сценарий занятия | 8−9 классы 2» и т.п.
// Повторяются на каждой странице и зашумляют чанки — вырезаем их до чанкинга.
const RUNNING_HEADER_RE =
  /(методические рекомендации|сценарий занятия)\s*\|\s*\d{1,2}\s*[−–-]\s*\d{1,2}\s*класс(?:ы|ов)?\s*\d*/gi

export function stripPdfBoilerplate(text: string): string {
  return text.replace(RUNNING_HEADER_RE, ' ').replace(/[ \t]{2,}/g, ' ')
}

const MD_HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*$/
const KEYWORD_HEADING =
  /^\s*(цель|задачи|ход\s+занятия|этап\s*\d*|основная\s+часть|вовлечение|рефлексия|рефлекси\S*|материалы|оборудование)([\s:#.,].*|$)/i

type RawSection = { title: string; body: string; kind: SectionKind; stageIdx?: number }

function classify(title: string): SectionKind {
  const t = title.toLowerCase()
  if (/рефлекси/.test(t)) return 'reflection'
  if (/цель|задач/.test(t)) return 'goal'
  if (/материал|оборудован/.test(t)) return 'materials'
  if (/ход\s+занятия|этап|основная\s+часть|вовлечение/.test(t)) return 'stage'
  return 'other'
}

function isHeading(line: string): string | null {
  const md = line.match(MD_HEADING)
  if (md) return md[1].trim()
  if (KEYWORD_HEADING.test(line.trim())) return line.replace(/[:#]+\s*$/, '').trim()
  return null
}

function splitSections(text: string): RawSection[] {
  const lines = text.split('\n')
  const sections: RawSection[] = []
  let curTitle = 'Введение'
  let curBody: string[] = []
  let stageCounter = 0

  const flush = () => {
    const body = curBody.join('\n').trim()
    const kind = classify(curTitle)
    const sec: RawSection = { title: curTitle, body, kind }
    if (kind === 'stage') {
      stageCounter += 1
      sec.stageIdx = stageCounter
    }
    if (body.length > 0 || kind !== 'other') sections.push(sec)
  }

  for (const line of lines) {
    const heading = isHeading(line)
    if (heading) {
      flush()
      curTitle = heading
      curBody = []
    } else {
      curBody.push(line)
    }
  }
  flush()
  return sections.filter((s) => s.body.trim().length > 0)
}

function splitByParagraph(body: string): string[] {
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p
    if (estimateTokens(candidate) > MAX_TOKENS && buf) {
      out.push(buf)
      buf = p
    } else {
      buf = candidate
    }
    while (estimateTokens(buf) > MAX_TOKENS) {
      const maxChars = MAX_TOKENS * 3
      out.push(buf.slice(0, maxChars))
      buf = buf.slice(maxChars)
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

export function chunkStructured(text: string): Chunk[] {
  const sections = splitSections(stripPdfBoilerplate(text))
  const chunks: Chunk[] = []

  let pending: RawSection | null = null
  const emit = (sec: RawSection) => {
    for (const piece of splitByParagraph(sec.body)) {
      if (piece.trim().length === 0) continue
      chunks.push({ text: piece.trim(), sectionKind: sec.kind, stageIdx: sec.stageIdx })
    }
  }

  for (const sec of sections) {
    if (pending) {
      const merged: RawSection = {
        title: pending.title,
        body: `${pending.body}\n\n${sec.body}`,
        kind: pending.kind,
        stageIdx: pending.stageIdx,
      }
      if (estimateTokens(merged.body) < MIN_TOKENS) {
        pending = merged
      } else {
        emit(merged)
        pending = null
      }
      continue
    }
    if (estimateTokens(sec.body) < MIN_TOKENS) {
      pending = sec
    } else {
      emit(sec)
    }
  }
  if (pending) emit(pending)
  return chunks
}
