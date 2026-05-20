import type { db as realDb } from '@/db'
import { calendarEvents } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'

type Db = typeof realDb

export type CalendarEventRow = {
  id: string
  scenarioId: string
  eventDate: string
  title: string
}

export async function bindScenarioToDate(
  db: Db,
  input: { userId: string; scenarioId: string; eventDate: string; title: string },
): Promise<string> {
  const [row] = await db.insert(calendarEvents).values(input).returning({ id: calendarEvents.id })
  return row.id
}

export async function listUserEvents(db: Db, userId: string): Promise<CalendarEventRow[]> {
  return db
    .select({
      id: calendarEvents.id,
      scenarioId: calendarEvents.scenarioId,
      eventDate: calendarEvents.eventDate,
      title: calendarEvents.title,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId))
    .orderBy(desc(calendarEvents.eventDate))
}

export async function unbindEvent(db: Db, userId: string, eventId: string): Promise<void> {
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)))
}
