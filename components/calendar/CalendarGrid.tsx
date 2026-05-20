'use client'

import { unbindEventAction } from '@/app/app/calendar/actions'
import type { CalendarOccasion } from '@/lib/calendar-events'
import type { CalendarEventRow } from '@/lib/calendar/events'
import Link from 'next/link'
import { useTransition } from 'react'

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

function monthOf(mmdd: string) {
  return Number(mmdd.slice(0, 2)) - 1
}

export function CalendarGrid({
  occasions,
  userEvents,
}: {
  occasions: CalendarOccasion[]
  userEvents: CalendarEventRow[]
}) {
  const [pending, start] = useTransition()
  const order = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]
  const byMonth = new Map<number, CalendarOccasion[]>()
  for (const o of occasions) {
    const m = monthOf(o.date)
    byMonth.set(m, [...(byMonth.get(m) ?? []), o])
  }

  return (
    <div className="space-y-8">
      {userEvents.length > 0 && (
        <section className="rounded-lg bg-brand-50 p-4 ring-1 ring-brand-200">
          <h2 className="mb-3 font-display text-lg font-semibold text-neutral-900">
            Ваши занятия на датах
          </h2>
          <ul className="space-y-2">
            {userEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href={`/app/scenarios/${e.scenarioId}`}
                  className="text-brand-700 hover:underline"
                >
                  {e.eventDate} — {e.title}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => unbindEventAction(e.id))}
                  className="text-neutral-400 hover:text-error"
                >
                  убрать
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {order
          .filter((m) => byMonth.has(m))
          .map((m) => (
            <div
              key={m}
              className="rounded-lg bg-neutral-0 p-4 shadow-card ring-1 ring-neutral-200"
            >
              <h3 className="mb-3 font-display font-semibold text-neutral-900">{MONTHS[m]}</h3>
              <ul className="space-y-3">
                {(byMonth.get(m) ?? []).map((o) => (
                  <li key={o.date}>
                    <Link
                      href={`/app/new?topic=${encodeURIComponent(o.title)}&calendarDate=${o.date}`}
                      className="block rounded-md px-2 py-1.5 hover:bg-brand-50"
                    >
                      <span className="text-sm font-medium text-neutral-900">{o.title}</span>
                      <span className="mt-1 block text-xs text-neutral-500">
                        {o.date.slice(3)}.{o.date.slice(0, 2)} · {o.suggested_direction}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  )
}
