'use client'

import { Input } from '@/components/ui/input'
import { DIRECTIONS, FORMATS, GRADES, formatGrade } from '@/lib/scenario/options'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

const selectClass =
  'h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-200'

export function ScenarioSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function pushParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const s = next.toString()
    router.replace(s ? `${pathname}?${s}` : pathname)
  }

  function onText(value: string) {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => pushParam('q', value.trim()), 300)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => onText(e.target.value)}
        placeholder="Поиск по названию сценария…"
        className="sm:max-w-xs"
      />
      <select
        className={selectClass}
        value={sp.get('direction') ?? ''}
        onChange={(e) => pushParam('direction', e.target.value)}
      >
        <option value="">Все направления</option>
        {DIRECTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={sp.get('grade') ?? ''}
        onChange={(e) => pushParam('grade', e.target.value)}
      >
        <option value="">Все классы</option>
        {GRADES.map((g) => (
          <option key={g} value={String(g)}>
            {formatGrade(g)}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={sp.get('format') ?? ''}
        onChange={(e) => pushParam('format', e.target.value)}
      >
        <option value="">Все форматы</option>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  )
}
