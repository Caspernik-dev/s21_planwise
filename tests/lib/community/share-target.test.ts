import { resolveShareTarget } from '@/lib/community/share-target'
import { describe, expect, it } from 'vitest'

describe('resolveShareTarget', () => {
  it('creates new shared row for original scenario, first share', () => {
    const r = resolveShareTarget(
      { sourceSharedId: null, lessonType: 'rov' },
      { alreadyShared: false },
    )
    expect(r).toEqual({ action: 'create', lessonType: 'rov' })
  })

  it('increments source shared like_count for a copy, first share', () => {
    const r = resolveShareTarget(
      { sourceSharedId: 'shared-1', lessonType: 'rov' },
      { alreadyShared: false },
    )
    expect(r).toEqual({ action: 'increment', sharedId: 'shared-1' })
  })

  it('does nothing if this scenario was already shared by this user', () => {
    const r = resolveShareTarget(
      { sourceSharedId: 'shared-1', lessonType: 'rov' },
      { alreadyShared: true },
    )
    expect(r).toEqual({ action: 'noop' })
  })

  it('carries lessonType through to create action', () => {
    const r = resolveShareTarget(
      { sourceSharedId: null, lessonType: 'krujok' },
      { alreadyShared: false },
    )
    expect(r).toEqual({ action: 'create', lessonType: 'krujok' })
  })
})
