'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { bindScenarioToDate, unbindEvent } from '@/lib/calendar/events'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type BindResult = { ok: true } | { ok: false; error: string }

export async function bindScenarioAction(
  scenarioId: string,
  eventDate: string,
): Promise<BindResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return { ok: false, error: 'Некорректная дата' }
  }

  const [owned] = await db
    .select({ id: scenarios.id, title: scenarios.title })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  await bindScenarioToDate(db, { userId, scenarioId, eventDate, title: owned.title })
  revalidatePath('/app/calendar')
  return { ok: true }
}

export async function unbindEventAction(eventId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  await unbindEvent(db, session.user.id, eventId)
  revalidatePath('/app/calendar')
}
