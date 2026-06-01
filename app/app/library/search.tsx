'use client'

import { SharedCard } from '@/components/community/SharedCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LESSON_TYPES, type LessonType } from '@/lib/scenario/options'
import { Search } from 'lucide-react'
import { useState, useTransition } from 'react'
import { type LibraryCard, searchSharedAction } from './actions'

export function LibrarySearch({ initial }: { initial: LibraryCard[] }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<LessonType | ''>('')
  const [cards, setCards] = useState<LibraryCard[]>(initial)
  const [pending, start] = useTransition()
  const [touched, setTouched] = useState(false)

  function run() {
    setTouched(true)
    start(async () =>
      setCards(await searchSharedAction(q, type === '' ? undefined : (type as LessonType))),
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Опишите тему: например, профориентация для 8 класса"
              onKeyDown={(e) => e.key === 'Enter' && run()}
              className="min-w-0 pl-9"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LessonType | '')}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Все типы занятий</option>
            {LESSON_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button type="button" onClick={run} disabled={pending}>
            {pending ? 'Ищем…' : 'Найти'}
          </Button>
        </div>
        {!touched && (
          <p className="mt-2 text-xs text-neutral-500">
            Пустой запрос → показываем популярные сценарии (топ по лайкам).
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl bg-brand-50 p-6 text-center ring-1 ring-brand-100">
          <p className="text-sm text-brand-900">
            Ничего не нашли по такому запросу. Попробуйте переформулировать тему или сменить тип
            занятия.
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs text-neutral-500">
            Найдено: <span className="font-medium text-neutral-700">{cards.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <SharedCard key={c.id} {...c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
