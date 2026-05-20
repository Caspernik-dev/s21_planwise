import { detectNames } from './names'
import { detectPatterns } from './patterns'
import type { PiiMatch } from './types'

// Объединяем матчи обоих детекторов и снимаем пересечения.
// Сортируем по началу по возрастанию, при равном начале — более длинный первым,
// затем жадно отбираем непересекающиеся (более длинный/ранний побеждает).
export function detectPII(text: string): PiiMatch[] {
  const all = [...detectPatterns(text), ...detectNames(text)].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )
  const result: PiiMatch[] = []
  let lastEnd = -1
  for (const m of all) {
    if (m.start >= lastEnd) {
      result.push(m)
      lastEnd = m.end
    }
  }
  return result
}
