import { needsPvRecheck } from '@/lib/auth/pv-check'
import { describe, expect, it } from 'vitest'

const nowSec = 1_700_000_000

describe('needsPvRecheck', () => {
  it('первая проверка (pvCheckedAt undefined) → true', () => {
    expect(needsPvRecheck(undefined, nowSec, 60)).toBe(true)
  })
  it('прошёл интервал → true', () => {
    expect(needsPvRecheck(nowSec - 120, nowSec, 60)).toBe(true)
  })
  it('интервал не прошёл → false', () => {
    expect(needsPvRecheck(nowSec - 30, nowSec, 60)).toBe(false)
  })
  it('точно граница → true (>=)', () => {
    expect(needsPvRecheck(nowSec - 60, nowSec, 60)).toBe(true)
  })
})
