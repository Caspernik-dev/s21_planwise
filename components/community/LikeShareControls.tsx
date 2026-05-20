'use client'

import { likeScenarioAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { useState, useTransition } from 'react'

export function LikeShareControls({
  scenarioId,
  initialLiked,
  initialShared,
}: { scenarioId: string; initialLiked: boolean; initialShared: boolean }) {
  const [liked, setLiked] = useState(initialLiked)
  const [shared, setShared] = useState(initialShared)
  const [optIn, setOptIn] = useState(initialShared)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function submit() {
    setMsg(null)
    start(async () => {
      const res = await likeScenarioAction(scenarioId, optIn)
      if (res.ok) {
        setLiked(true)
        setShared(res.shared)
        setMsg(res.shared ? 'Опубликовано в библиотеке сообщества' : 'Сохранено в избранном')
      } else {
        setMsg(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Поделиться с сообществом
        </label>
        <Button
          type="button"
          size="sm"
          variant={liked ? 'default' : 'outline'}
          disabled={pending}
          onClick={submit}
        >
          {liked ? (shared ? '❤ В библиотеке' : '❤ Нравится') : '♡ Нравится'}
        </Button>
      </div>
      {msg && <p className="max-w-xs text-right text-xs text-neutral-500">{msg}</p>}
    </div>
  )
}
