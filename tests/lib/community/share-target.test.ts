import { resolveShareTarget } from '@/lib/community/share-target'
import { describe, expect, it } from 'vitest'

describe('resolveShareTarget', () => {
  it('creates new shared row for original scenario, first share', () => {
    const r = resolveShareTarget({ sourceSharedId: null }, { alreadyShared: false })
    expect(r).toEqual({ action: 'create' })
  })

  it('increments source shared like_count for a copy, first share', () => {
    const r = resolveShareTarget({ sourceSharedId: 'shared-1' }, { alreadyShared: false })
    expect(r).toEqual({ action: 'increment', sharedId: 'shared-1' })
  })

  it('does nothing if this scenario was already shared by this user', () => {
    const r = resolveShareTarget({ sourceSharedId: 'shared-1' }, { alreadyShared: true })
    expect(r).toEqual({ action: 'noop' })
  })
})
