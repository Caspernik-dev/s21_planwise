import { auth } from '@/auth'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { db } from '@/db'
import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { listUserEvents } from '@/lib/calendar/events'
import { redirect } from 'next/navigation'

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userEvents = await listUserEvents(db, session.user.id)
  return (
    <div>
      <h1 className="mb-2 text-3xl font-semibold text-neutral-900">Календарь поводов</h1>
      <p className="mb-6 text-neutral-600">
        Памятные даты учебного года. Выберите повод, чтобы создать сценарий, или посмотрите
        привязанные занятия.
      </p>
      <CalendarGrid occasions={CALENDAR_EVENTS} userEvents={userEvents} />
    </div>
  )
}
