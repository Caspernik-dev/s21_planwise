export function barPercent(value: number, max: number): number {
  if (max <= 0) return 0
  const pct = (value / max) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export function successRate(ok: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((ok / total) * 100)
}
