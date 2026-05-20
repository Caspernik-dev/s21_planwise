export type ShareTarget =
  | { action: 'create' }
  | { action: 'increment'; sharedId: string }
  | { action: 'noop' }

export function resolveShareTarget(
  scenario: { sourceSharedId: string | null },
  like: { alreadyShared: boolean },
): ShareTarget {
  if (like.alreadyShared) return { action: 'noop' }
  if (scenario.sourceSharedId) return { action: 'increment', sharedId: scenario.sourceSharedId }
  return { action: 'create' }
}
