import type { DailyUsage } from '@/lib/ratelimit/usage'

export function QuotaBadge({ usage }: { usage: DailyUsage }) {
  if (usage.unlimited) {
    return (
      <span
        title="Без лимита генераций"
        className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-800"
        aria-label="Без лимита генераций"
      >
        ∞
      </span>
    )
  }
  const { limit, remaining, resetAt } = usage
  const tone =
    remaining === 0
      ? 'bg-red-100 text-red-700'
      : remaining <= 3
        ? 'bg-warm-100 text-warm-800'
        : 'bg-neutral-100 text-neutral-700'
  const resetHm = resetAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const title = `Осталось ${remaining} из ${limit} генераций на сегодня. Сброс в ${resetHm}`
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {remaining}/{limit}
    </span>
  )
}
