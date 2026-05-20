import { barPercent } from '@/lib/admin/format'

export function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) return <p className="text-sm text-neutral-400">Нет данных</p>
  const max = Math.max(...items.map((i) => i.value))
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm text-neutral-700">
            <span className="truncate pr-2">{i.label}</span>
            <span className="tabular-nums text-neutral-500">{i.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${barPercent(i.value, max)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
