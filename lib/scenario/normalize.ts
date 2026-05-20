import type { ScenarioContent } from './schema'

export function normalizeChronometry(
  content: ScenarioContent,
  targetMin: number,
): { content: ScenarioContent; changed: boolean } {
  const stages = content.stages
  const n = stages.length
  const current = stages.reduce((a, s) => a + s.duration_min, 0)

  if (current === targetMin) return { content, changed: false }

  const raw =
    current > 0
      ? stages.map((s) => (s.duration_min / current) * targetMin)
      : stages.map(() => targetMin / n)

  let durations = raw.map((v) => Math.max(1, Math.floor(v)))

  let diff = targetMin - durations.reduce((a, v) => a + v, 0)
  let i = 0
  let guard = 0
  while (diff !== 0 && guard < 10000) {
    const idx = i % n
    if (diff > 0) {
      durations[idx] += 1
      diff -= 1
    } else if (durations[idx] > 1) {
      durations[idx] -= 1
      diff += 1
    }
    i += 1
    guard += 1
  }

  const newStages = stages.map((s, idx) => ({ ...s, duration_min: durations[idx] }))
  return { content: { ...content, stages: newStages }, changed: true }
}
