import type { ScenarioContent } from './schema'

// Пол длительности этапа (мин). Целевой 3, но не выше равной доли — чтобы влезало
// и в короткие занятия. Настраивается через env.
const MIN_STAGE_MINUTES = Number(process.env.MIN_STAGE_MINUTES ?? 3)

export function normalizeChronometry(
  content: ScenarioContent,
  targetMin: number,
): { content: ScenarioContent; changed: boolean } {
  const stages = content.stages
  const n = stages.length
  const current = stages.reduce((a, s) => a + s.duration_min, 0)

  // floor*n ≤ targetMin гарантировано: floor ≤ ⌊targetMin/n⌋.
  const floor = Math.max(1, Math.min(MIN_STAGE_MINUTES, Math.floor(targetMin / n)))

  const raw =
    current > 0
      ? stages.map((s) => (s.duration_min / current) * targetMin)
      : stages.map(() => targetMin / n)

  // Пропорция → пол.
  const durations = raw.map((v) => Math.max(floor, Math.floor(v)))

  // Добор до точной суммы: +1 по кругу; −1 только у этапов выше пола.
  let diff = targetMin - durations.reduce((a, v) => a + v, 0)
  let i = 0
  let guard = 0
  while (diff !== 0 && guard < 100000) {
    const idx = i % n
    if (diff > 0) {
      durations[idx] += 1
      diff -= 1
    } else if (durations[idx] > floor) {
      durations[idx] -= 1
      diff += 1
    }
    i += 1
    guard += 1
  }

  const changed = durations.some((d, idx) => d !== stages[idx].duration_min)
  if (!changed) return { content, changed: false }
  const newStages = stages.map((s, idx) => ({ ...s, duration_min: durations[idx] }))
  return { content: { ...content, stages: newStages }, changed: true }
}
