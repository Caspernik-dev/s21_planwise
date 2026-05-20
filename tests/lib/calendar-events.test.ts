import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { DIRECTIONS, FORMATS } from '@/lib/scenario/options'
import { describe, expect, it } from 'vitest'

describe('CALENDAR_EVENTS', () => {
  it('содержит не менее 20 поводов', () => {
    expect(CALENDAR_EVENTS.length).toBeGreaterThanOrEqual(20)
  })
  it('даты в формате MM-DD и уникальны', () => {
    const seen = new Set<string>()
    for (const e of CALENDAR_EVENTS) {
      expect(e.date).toMatch(/^\d{2}-\d{2}$/)
      expect(seen.has(e.date)).toBe(false)
      seen.add(e.date)
    }
  })
  it('direction и formats валидны', () => {
    for (const e of CALENDAR_EVENTS) {
      expect(DIRECTIONS).toContain(e.suggested_direction)
      expect(e.suggested_formats.length).toBeGreaterThan(0)
      for (const f of e.suggested_formats) expect(FORMATS).toContain(f)
    }
  })
})
