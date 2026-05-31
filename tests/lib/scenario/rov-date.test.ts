import {
  formatLessonDateRu,
  isMonday,
  nearestMonday,
  rovLessonNumber,
} from '@/lib/scenario/rov-date'
import { describe, expect, it } from 'vitest'

describe('isMonday', () => {
  it('returns true for a Monday', () => {
    expect(isMonday('2026-09-07')).toBe(true)
  })

  it('returns false for a Tuesday', () => {
    expect(isMonday('2026-09-08')).toBe(false)
  })

  it('returns false for a Sunday', () => {
    expect(isMonday('2026-09-06')).toBe(false)
  })

  it('returns false for invalid month', () => {
    expect(isMonday('2026-13-01')).toBe(false)
  })

  it('returns false for non-numeric', () => {
    expect(isMonday('abc')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMonday('')).toBe(false)
  })

  it('returns false for invalid day', () => {
    expect(isMonday('2026-09-31')).toBe(false)
  })

  it('returns false for Feb 30', () => {
    expect(isMonday('2026-02-30')).toBe(false)
  })
})

describe('nearestMonday', () => {
  it('returns same date when already Monday', () => {
    expect(nearestMonday('2026-09-07')).toBe('2026-09-07')
  })

  it('snaps Tuesday 1 day after back to previous Monday', () => {
    // 2026-09-08 is Tuesday, 1 day after 2026-09-07 (Mon), 6 days before next Mon
    expect(nearestMonday('2026-09-08')).toBe('2026-09-07')
  })

  it('snaps Sunday 1 day before next Monday forward', () => {
    // 2026-09-13 is Sunday, 1 day before 2026-09-14 (Mon), 6 days after prev Mon
    expect(nearestMonday('2026-09-13')).toBe('2026-09-14')
  })

  it('snaps Thursday (back 3, fwd 4) to previous Monday', () => {
    // 2026-09-10 is Thursday, prev Monday = 2026-09-07
    expect(nearestMonday('2026-09-10')).toBe('2026-09-07')
  })

  it('snaps Friday (back 4, fwd 3) to next Monday', () => {
    // 2026-09-11 is Friday, next Monday = 2026-09-14
    expect(nearestMonday('2026-09-11')).toBe('2026-09-14')
  })

  it('crosses month boundary backward', () => {
    // 2026-10-01 is Thursday (back 3 -> 2026-09-28 Mon, fwd 4 -> 2026-10-05 Mon)
    expect(nearestMonday('2026-10-01')).toBe('2026-09-28')
  })

  it('crosses year boundary', () => {
    // 2027-01-01 is Friday (back 4 -> 2026-12-28, fwd 3 -> 2027-01-04)
    expect(nearestMonday('2027-01-01')).toBe('2027-01-04')
  })

  it('returns unchanged input for malformed date (no throw)', () => {
    expect(nearestMonday('not-a-date')).toBe('not-a-date')
  })
})

describe('rovLessonNumber', () => {
  it('returns 1 for first Monday of Sep 2026', () => {
    expect(rovLessonNumber('2026-09-07')).toBe(1)
  })

  it('returns 2 for second Monday', () => {
    expect(rovLessonNumber('2026-09-14')).toBe(2)
  })

  it('returns 34 for last lesson in 2026-27 school year', () => {
    // Lesson 34 = 33 weeks after 2026-09-07 = 2027-04-26
    expect(rovLessonNumber('2027-04-26')).toBe(34)
  })

  it('returns null for non-Monday', () => {
    expect(rovLessonNumber('2026-09-08')).toBeNull()
  })

  it('returns null for summer Monday beyond cycle', () => {
    // 2026-07-06 is Monday in school year starting 2025-09-01, lesson ~45 > 34
    expect(rovLessonNumber('2026-07-06')).toBeNull()
  })

  it('returns null for May 2026 Monday (lesson 36, beyond cycle)', () => {
    // 2026-05-04 is Monday, school year started 2025-09-01, lesson 36 > 34
    expect(rovLessonNumber('2026-05-04')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(rovLessonNumber('bad-date')).toBeNull()
  })

  it('returns 1 for first Monday of Sep 2025 school year', () => {
    // 2025-09-01 is Monday
    expect(rovLessonNumber('2025-09-01')).toBe(1)
  })
})

describe('formatLessonDateRu', () => {
  it('formats 2026-09-07 in Russian', () => {
    // Node Intl returns "понедельник, 7 сентября 2026 г." - strip " г." and lowercase
    expect(formatLessonDateRu('2026-09-07')).toBe('понедельник, 7 сентября 2026')
  })

  it('formats 2027-01-04 in Russian', () => {
    expect(formatLessonDateRu('2027-01-04')).toBe('понедельник, 4 января 2027')
  })

  it('returns input unchanged for malformed date', () => {
    expect(formatLessonDateRu('not-a-date')).toBe('not-a-date')
  })

  it('returns input unchanged for empty string', () => {
    expect(formatLessonDateRu('')).toBe('')
  })
})
