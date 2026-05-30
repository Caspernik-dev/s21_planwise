import { Card } from '@/components/ui/card'
import { LESSON_TYPES, type LessonType } from '@/lib/scenario/options'
import { Brain, Flag, FlaskConical, PartyPopper, Sparkles } from 'lucide-react'
import Link from 'next/link'

const ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  rov: Flag,
  krujok: Sparkles,
  literacy: Brain,
  subject_extension: FlaskConical,
  event: PartyPopper,
}

export function LessonTypePicker({ extraQuery }: { extraQuery?: Record<string, string> }) {
  const qsSuffix =
    extraQuery && Object.keys(extraQuery).length
      ? `&${new URLSearchParams(extraQuery).toString()}`
      : ''

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {LESSON_TYPES.map((t) => {
        const Icon = ICONS[t.value]
        return (
          <Link key={t.value} href={`/app/new?type=${t.value}${qsSuffix}`} className="block">
            <Card className="h-full p-5 ring-1 ring-neutral-200 transition-shadow hover:shadow-hover">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-onest text-lg font-semibold text-neutral-900">{t.label}</h3>
                    {t.federal ? (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">
                        Федеральный курс
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        Программа школы
                      </span>
                    )}
                    {!t.federal && (
                      <span className="rounded-full bg-warm-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warm-800">
                        beta
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-600">{t.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
