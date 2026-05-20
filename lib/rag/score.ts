export function normalizeBm25(values: number[]): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 0)
  return values.map((v) => (v - min) / (max - min))
}

export function combineScore(cosine: number, bm25norm: number): number {
  return 0.7 * cosine + 0.3 * bm25norm
}

export function diversify<T extends { documentId: string }>(items: T[], maxPerDoc: number): T[] {
  const counts = new Map<string, number>()
  const out: T[] = []
  for (const item of items) {
    const n = counts.get(item.documentId) ?? 0
    if (n >= maxPerDoc) continue
    counts.set(item.documentId, n + 1)
    out.push(item)
  }
  return out
}

export type Candidate = { id: string; documentId: string; cosine: number; bm25: number }
export type Scored = Candidate & { score: number }

export function rankAndDiversify(
  candidates: Candidate[],
  opts: { topK: number; maxPerDoc: number },
): Scored[] {
  const bm25norm = normalizeBm25(candidates.map((c) => c.bm25))
  const scored: Scored[] = candidates.map((c, i) => ({
    ...c,
    score: combineScore(c.cosine, bm25norm[i]),
  }))
  scored.sort((a, b) => b.score - a.score)
  return diversify(scored, opts.maxPerDoc).slice(0, opts.topK)
}
