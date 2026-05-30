import type { GenerationInput, ScenarioContent } from '@/lib/scenario/schema'

export type SharedRow = {
  id: string
  anonymizedContent: ScenarioContent
  direction: string
  grade: number
  durationMin: number
  format: string
  topic: string
}

export function sharedToScenarioInsert(shared: SharedRow, userId: string) {
  // TODO(Task 14-16): lessonType will be stored in shared_scenarios; defaulting to 'rov' for existing rows
  const inputContext: GenerationInput = {
    lessonType: 'rov',
    direction: shared.direction as GenerationInput['direction'],
    grade: shared.grade,
    topic: shared.topic,
    durationMin: shared.durationMin,
    format: shared.format as GenerationInput['format'],
  }
  return {
    userId,
    title: shared.anonymizedContent.title,
    direction: shared.direction,
    grade: shared.grade,
    durationMin: shared.durationMin,
    format: shared.format,
    topic: shared.topic,
    sourceSharedId: shared.id,
    content: shared.anonymizedContent,
    inputContext,
  }
}
