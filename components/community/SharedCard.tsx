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
    <Card className="relative h-full ring-1 ring-neutral-200 shadow-card transition hover:shadow-hover hover:ring-brand-200">
      {lessonType && (
        <span className="absolute right-3 top-3 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100">
          {lessonTypeLabel(lessonType as Parameters<typeof lessonTypeLabel>[0])}
        </span>
      )}
      <CardHeader>
        <CardTitle className="pr-24 text-base text-neutral-900">{title}</CardTitle>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {direction && direction !== '—' && (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
              {direction}
            </span>
          )}
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">{format}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-2.5 py-1 font-medium text-warm-700">
            <span aria-hidden>❤</span>
            {likeCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-100">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Этапы занятия
          </div>
          <ol className="space-y-1 text-sm text-neutral-700">
            {stages.slice(0, 3).map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: preview list, no stable id
              <li key={`st-${i}`} className="flex gap-2">
                <span className="text-brand-600 font-medium">{i + 1}.</span>
                <span className="line-clamp-1">{s.title}</span>
              </li>
            ))}
            {stages.length > 3 && (
              <li className="pl-5 text-xs text-neutral-500">и ещё {stages.length - 3}…</li>
            )}
          </ol>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => start(() => useSharedAsIsAction(id))}
          className="w-full"
        >
          {pending ? 'Копируем…' : 'Использовать как есть'}
        </Button>
      </CardContent>
    </Card>
  )
}
