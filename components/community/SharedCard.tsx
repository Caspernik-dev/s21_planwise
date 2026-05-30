'use client'

import { useSharedAsIsAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { lessonTypeLabel } from '@/lib/scenario/options'
import { useTransition } from 'react'

type StagePreview = { title: string }

export function SharedCard({
  id,
  title,
  direction,
  format,
  likeCount,
  lessonType,
  stages,
}: {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  lessonType?: string
  stages: StagePreview[]
}) {
  const [pending, start] = useTransition()
  return (
    <Card className="relative ring-1 ring-neutral-200 shadow-card">
      {lessonType && (
        <span className="absolute right-3 top-3 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {lessonTypeLabel(lessonType as Parameters<typeof lessonTypeLabel>[0])}
        </span>
      )}
      <CardHeader>
        <CardTitle className="pr-24 text-base">{title}</CardTitle>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {[direction, format, `❤ ${likeCount}`].map((b) => (
            <span key={b} className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">
              {b}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-neutral-600">
          {stages.slice(0, 3).map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: preview list, no stable id
            <li key={`st-${i}`}>{s.title}</li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => start(() => useSharedAsIsAction(id))}
        >
          {pending ? 'Копируем…' : 'Использовать как есть'}
        </Button>
      </CardContent>
    </Card>
  )
}
