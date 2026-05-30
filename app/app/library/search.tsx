'use client'

import { SharedCard } from '@/components/community/SharedCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LESSON_TYPES, type LessonType } from '@/lib/scenario/options'
import { useState, useTransition } from 'react'
import { type LibraryCard, searchSharedAction } from './actions'

export function LibrarySearch({ initial }: { initial: LibraryCard[] }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<LessonType | ''>('')
  const [cards, setCards] = useState<LibraryCard[]>(initial)
  const [pending, start] = useTransition()

  function run() {
    start(async () =>
      setCards(await searchSharedAction(q, type === '' ? undefined : (type as LessonType))),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Опишите тему: например, профориентация для 8 класса"
          onKeyDown={(e) => e.key === 'Enter' && run()}
          className="min-w-0 flex-1"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LessonType | '')}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Все типы</option>
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
      {cards.length === 0 ? (
        <p className="text-sm text-neutral-500">Ничего не найдено. Попробуйте другой запрос.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <SharedCard key={c.id} {...c} />
          ))}
        </div>
      )}
    </div>
  )
}
