import type { ScenarioContent, ScenarioStage } from './schema'

function newActivity(): ScenarioStage['activities'][number] {
  return { type: 'discussion', text: 'Новая активность' }
}

function newStage(): ScenarioStage {
  return { kind: 'main', title: 'Новый этап', duration_min: 5, activities: [newActivity()] }
}

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

export function addStage(content: ScenarioContent): ScenarioContent {
  return { ...content, stages: [...content.stages, newStage()] }
}

export function removeStage(content: ScenarioContent, index: number): ScenarioContent {
  if (index < 0 || index >= content.stages.length) return content
  if (content.stages.length <= 1) return content
  return { ...content, stages: content.stages.filter((_, i) => i !== index) }
}

export function addActivity(content: ScenarioContent, stageIndex: number): ScenarioContent {
  const stage = content.stages[stageIndex]
  if (!stage) return content
  const stages = content.stages.slice()
  stages[stageIndex] = { ...stage, activities: [...stage.activities, newActivity()] }
  return { ...content, stages }
}

export function removeActivity(
  content: ScenarioContent,
  stageIndex: number,
  activityIndex: number,
): ScenarioContent {
  const stage = content.stages[stageIndex]
  if (!stage) return content
  if (activityIndex < 0 || activityIndex >= stage.activities.length) return content
  if (stage.activities.length <= 1) return content
  const stages = content.stages.slice()
  stages[stageIndex] = {
    ...stage,
    activities: stage.activities.filter((_, i) => i !== activityIndex),
  }
  return { ...content, stages }
}
