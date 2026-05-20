'use client'

import { SharedCard } from '@/components/community/SharedCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState, useTransition } from 'react'
import { type LibraryCard, searchSharedAction } from './actions'

export function LibrarySearch({ initial }: { initial: LibraryCard[] }) {
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<LibraryCard[]>(initial)
  const [pending, start] = useTransition()

  function run() {
    start(async () => setCards(await searchSharedAction(q)))
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Опишите тему: например, профориентация для 8 класса"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
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
