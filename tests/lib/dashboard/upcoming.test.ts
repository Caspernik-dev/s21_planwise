import type { CalendarOccasion } from '@/lib/calendar-events'
import { pickUpcoming, resolveUpcomingDate } from '@/lib/dashboard/upcoming'
import { describe, expect, it } from 'vitest'

const TODAY = new Date(Date.UTC(2026, 4, 24)) // 2026-05-24

const CAL: CalendarOccasion[] = [
  {
    date: '09-01',
    title: 'День знаний',
    suggested_direction: 'Познавательное',
    suggested_formats: ['беседа'],
  },
  {
    date: '06-01',
    title: 'День защиты детей',
    suggested_direction: 'Гражданское',
    suggested_formats: ['игра'],
  },
  {
    date: '05-09',
    title: 'День Победы',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['беседа'],
  },
  {
    date: '12-12',
    title: 'День Конституции',
    suggested_direction: 'Гражданское',
    suggested_formats: ['квиз'],
  },
]

describe('resolveUpcomingDate', () => {
  it('rolls a no-year DD.MM forward to the nearest future occurrence', () => {
    expect(resolveUpcomingDate('01.09', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('rolls a passed no-year DD.MM into next year', () => {
    expect(resolveUpcomingDate('09.05', TODAY)?.toISOString().slice(0, 10)).toBe('2027-05-09')
  })

  it('accepts slash separator', () => {
    expect(resolveUpcomingDate('1/9', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('keeps an explicit future year date', () => {
    expect(resolveUpcomingDate('01.09.2026', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('drops an explicit past year date', () => {
    expect(resolveUpcomingDate('01.09.2020', TODAY)).toBeNull()
  })

  it('rolls a no-year 29.02 forward to the next leap year', () => {
    expect(resolveUpcomingDate('29.02', TODAY)?.toISOString().slice(0, 10)).toBe('2028-02-29')
  })

  it('drops an invalid calendar date', () => {
    expect(resolveUpcomingDate('31.02', TODAY)).toBeNull()
  })

  it('drops unparseable junk', () => {
    expect(resolveUpcomingDate('как-то так', TODAY)).toBeNull()
  })
})

describe('pickUpcoming', () => {
  it('returns 3 nearest plan topics with dates, ascending', () => {
    const out = pickUpcoming({
      today: TODAY,
      planTopics: [
        { id: 'a', title: 'Дружба', plannedDate: '01.09', scenarioId: null },
        { id: 'b', title: 'Семья', plannedDate: '15.06', scenarioId: 's1' },
        { id: 'c', title: 'Труд', plannedDate: '01.10', scenarioId: null },
        { id: 'd', title: 'Без даты', plannedDate: null, scenarioId: null },
      ],
      calendar: CAL,
    })
    expect(out.map((i) => i.title)).toEqual(['Семья', 'Дружба', 'Труд'])
    expect(out[0]).toMatchObject({ source: 'plan', planTopicId: 'b', scenarioId: 's1' })
  })

  it('falls back to calendar when no plan topic has a usable date', () => {
    const out = pickUpcoming({
      today: TODAY,
      planTopics: [{ id: 'x', title: 'Тема', plannedDate: null, scenarioId: null }],
      calendar: CAL,
    })
    expect(out.every((i) => i.source === 'calendar')).toBe(true)
    expect(out).toHaveLength(3)
    expect(out[0].title).toBe('День защиты детей') // 2026-06-01 — ближайший
  })

  it('returns empty array when neither source yields anything', () => {
    expect(pickUpcoming({ today: TODAY, planTopics: [], calendar: [] })).toEqual([])
  })
})
