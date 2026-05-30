import type { LessonType } from '@/lib/scenario/options'

export type ShareTarget =
  | { action: 'create'; lessonType: LessonType }
  | { action: 'increment'; sharedId: string }
  | { action: 'noop' }

export function resolveShareTarget(
  scenario: { sourceSharedId: string | null; lessonType: LessonType },
  like: { alreadyShared: boolean },
): ShareTarget {
  if (like.alreadyShared) return { action: 'noop' }
  if (scenario.sourceSharedId) return { action: 'increment', sharedId: scenario.sourceSharedId }
  return { action: 'create', lessonType: scenario.lessonType }
}
