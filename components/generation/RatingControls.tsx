'use client'

import { rateGenerationAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useState, useTransition } from 'react'

export function RatingControls({
  scenarioId,
  initialRating,
  initialFeedback,
}: {
  scenarioId: string
  initialRating: number | null
  initialFeedback: string | null
}) {
  const [rating, setRating] = useState<number | null>(initialRating)
  const [feedback, setFeedback] = useState(initialFeedback ?? '')
  const [showFeedback, setShowFeedback] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function rate(value: number) {
    setMsg(null)
    setRating(value)
    if (value === -1) setShowFeedback(true)
    start(async () => {
      const res = await rateGenerationAction(scenarioId, value, feedback)
      setMsg(res.ok ? 'Спасибо за оценку!' : res.error)
    })
  }

  function submitFeedback() {
    if (rating === null) return
    setMsg(null)
    start(async () => {
      const res = await rateGenerationAction(scenarioId, rating, feedback)
      if (res.ok) {
        setShowFeedback(false)
        setMsg('Спасибо за оценку!')
      } else {
        setMsg(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600">Оцените сценарий:</span>
        <Button
          type="button"
          size="sm"
          variant={rating === 1 ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => rate(1)}
        >
          👍
        </Button>
        <Button
          type="button"
          size="sm"
          variant={rating === -1 ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => rate(-1)}
        >
          👎
        </Button>
      </div>
      {showFeedback && (
        <div className="flex w-72 flex-col items-end gap-1.5">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Что улучшить? (необязательно)"
            className="text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={submitFeedback}
          >
            Отправить отзыв
          </Button>
        </div>
      )}
      {msg && <p className="max-w-xs text-right text-xs text-neutral-500">{msg}</p>}
    </div>
  )
}
