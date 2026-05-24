import type { CalendarOccasion } from '@/lib/calendar-events'

export type UpcomingItem = {
  title: string
  date: Date
  source: 'plan' | 'calendar'
  planTopicId?: string
  scenarioId?: string | null
  calendarDate?: string // 'MM-DD'
}

const RU_DATE = /^(\d{1,2})[./](\d{1,2})(?:[./]((?:19|20)\d{2}))?$/

function makeUtcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return d
}

function startOfUtcDay(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
}

// Ближайшее будущее вхождение day/month относительно today (учебный год от сегодня).
function forwardOccurrence(month: number, day: number, today: Date): Date | null {
  const floor = startOfUtcDay(today)
  const base = today.getUTCFullYear()
  // >1 года вперёд: бездатное 29.02 должно проскочить невисокосные годы до ближайшего високосного.
  for (let y = base; y <= base + 8; y++) {
    const d = makeUtcDate(y, month, day)
    if (d && d.getTime() >= floor) return d
  }
  return null
}

export function resolveUpcomingDate(raw: string, today: Date): Date | null {
  const m = raw.trim().match(RU_DATE)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (m[3]) {
    const d = makeUtcDate(Number(m[3]), month, day)
    if (!d || d.getTime() < startOfUtcDay(today)) return null
    return d
  }
  return forwardOccurrence(month, day, today)
}

export function pickUpcoming(args: {
  today: Date
  planTopics: { id: string; title: string; plannedDate: string | null; scenarioId: string | null }[]
  calendar: CalendarOccasion[]
}): UpcomingItem[] {
  const { today, planTopics, calendar } = args

  const planItems: UpcomingItem[] = []
  for (const t of planTopics) {
    if (!t.plannedDate) continue
    const d = resolveUpcomingDate(t.plannedDate, today)
    if (!d) continue
    planItems.push({
      title: t.title,
      date: d,
      source: 'plan',
      planTopicId: t.id,
      scenarioId: t.scenarioId,
    })
  }
  if (planItems.length > 0) {
    return planItems.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3)
  }

  const calItems: UpcomingItem[] = []
  for (const o of calendar) {
    const [mm, dd] = o.date.split('-').map(Number)
    const d = forwardOccurrence(mm, dd, today)
    if (!d) continue
    calItems.push({ title: o.title, date: d, source: 'calendar', calendarDate: o.date })
  }
  return calItems.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3)
}
