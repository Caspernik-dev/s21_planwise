export interface ParsedTopic {
  title: string
  plannedDate: string | null
  orderIdx: number
}

const MARKER = /^\s*(?:\d{1,3}[.)]|[-•*–—])\s*/
const DATE = /\b(\d{1,2}[./]\d{1,2}(?:[./](?:19|20)\d{2})?)\b/
const HEADING = /^[А-ЯЁ\s]{3,}$/ // строка из заглавных — вероятно заголовок

export function parsePlanTopics(text: string): ParsedTopic[] {
  const topics: ParsedTopic[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue

    // дату вытаскиваем до снятия маркера: иначе «01.» съест MARKER как нумерацию
    let plannedDate: string | null = null
    const dateMatch = line.match(DATE)
    if (dateMatch) {
      plannedDate = dateMatch[1]
      // убираем дату и ведущие разделители вида «— », «- », «: »
      line = line
        .replace(DATE, '')
        .replace(/^\s*[—–\-:.]\s*/, '')
        .trim()
    }

    const hadMarker = MARKER.test(line)
    line = line.replace(MARKER, '').trim()

    // фильтры: тема — только строка с маркером или датой; прочее считаем прозой/заголовком
    if (!hadMarker && !plannedDate) continue
    if (line.length < 4) continue
    if (HEADING.test(rawLine.trim())) continue

    topics.push({ title: line, plannedDate, orderIdx: topics.length })
  }
  return topics
}
