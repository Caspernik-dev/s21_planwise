'use client'

import { rateGenerationAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [showFeedback, setShowFeedback] = useState(initialRating !== null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function rate(value: number) {
    setMsg(null)
    setRating(value)
    setShowFeedback(true)
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
      setMsg(res.ok ? 'Спасибо за отзыв!' : res.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Оцените сценарий</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={rating === 1 ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => rate(1)}
          >
            👍 Нравится
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rating === -1 ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => rate(-1)}
          >
            👎 Не нравится
          </Button>
        </div>
        {showFeedback && (
          <div className="flex flex-col items-start gap-2">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Расскажите, что понравилось или что улучшить (необязательно)"
              className="text-sm"
              aria-label="Отзыв о сценарии"
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
        {msg && <p className="text-sm text-neutral-500">{msg}</p>}
      </CardContent>
    </Card>
  )
}
