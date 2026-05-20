// Парсит накопленный SSE-буфер. Возвращает завершённые data-payload'ы
// (события разделены '\n\n') и незавершённый хвост для следующего чтения.
export function parseSSEBuffer(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  let rest = buffer
  let idx = rest.indexOf('\n\n')
  while (idx !== -1) {
    const raw = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
    if (dataLines.length > 0) events.push(dataLines.join('\n'))
    idx = rest.indexOf('\n\n')
  }
  return { events, rest }
}
