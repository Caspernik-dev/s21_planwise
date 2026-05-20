import type { ScenarioContent } from './schema'

function swap<T>(arr: T[], i: number, j: number): T[] {
  const copy = arr.slice()
  const tmp = copy[i]
  copy[i] = copy[j]
  copy[j] = tmp
  return copy
}

export function moveStage(content: ScenarioContent, index: number, dir: -1 | 1): ScenarioContent {
  const target = index + dir
  if (target < 0 || target >= content.stages.length) return content
  return { ...content, stages: swap(content.stages, index, target) }
}

export function moveActivity(
  content: ScenarioContent,
  stageIndex: number,
  activityIndex: number,
  dir: -1 | 1,
): ScenarioContent {
  const stage = content.stages[stageIndex]
  if (!stage) return content
  const target = activityIndex + dir
  if (target < 0 || target >= stage.activities.length) return content
  const stages = content.stages.slice()
  stages[stageIndex] = { ...stage, activities: swap(stage.activities, activityIndex, target) }
  return { ...content, stages }
}
