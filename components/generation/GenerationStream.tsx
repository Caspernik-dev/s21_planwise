'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { parseSSEBuffer } from '@/lib/gigachat/sse'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Phase = 'skeleton' | 'details' | 'validating' | 'saving'

type StreamEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'skeleton'; data: { title?: string; stages?: Array<{ title?: string }> } }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }

const PHASE_LABEL: Record<Phase, string> = {
  skeleton: 'Структура',
  details: 'Детализация этапов',
  validating: 'Проверка',
  saving: 'Сохранение',
}
const PHASE_ORDER: Phase[] = ['skeleton', 'details', 'validating', 'saving']

export function GenerationStream({ payload }: { payload: Record<string, unknown> }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('skeleton')
  const [title, setTitle] = useState<string | null>(null)
  const [stageTitles, setStageTitles] = useState<string[]>([])
  const [blocksDone, setBlocksDone] = useState(0)
  const [blocksTotal, setBlocksTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const ac = new AbortController()

    void (async () => {
      try {
        const res = await fetch('/api/generate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ac.signal,
        })
        if (res.status === 429) {
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? 'Превышен дневной лимит генераций.')
          return
        }
        if (!res.ok || !res.body) {
          setError('Не удалось запустить генерацию.')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSSEBuffer(buffer)
          buffer = rest
          for (const raw of events) {
            let ev: StreamEvent
            try {
              ev = JSON.parse(raw) as StreamEvent
            } catch {
              continue
            }
            if (ev.type === 'phase') setPhase(ev.phase)
            else if (ev.type === 'skeleton') {
              if (ev.data.title) setTitle(ev.data.title)
              if (Array.isArray(ev.data.stages)) {
                const titles = ev.data.stages.map((s) => s.title ?? 'Этап')
                setStageTitles(titles)
              }
            } else if (ev.type === 'block') {
              setBlocksTotal(ev.total)
              setBlocksDone((n) => Math.max(n, ev.index + 1))
            } else if (ev.type === 'done') router.push(`/app/scenarios/${ev.scenarioId}`)
            else if (ev.type === 'error') setError(ev.message)
          }
        }
      } catch {
        if (!ac.signal.aborted) setError('Соединение прервано. Попробуйте ещё раз.')
      }
    })()

    return () => ac.abort()
  }, [payload, router])

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-error">{error}</p>
          <Button type="button" onClick={() => window.location.reload()}>
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    )
  }

  const phaseIdx = PHASE_ORDER.indexOf(phase)
  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle>{title ?? 'Генерируем сценарий…'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PHASE_ORDER.map((p, i) => (
            <span
              key={p}
              className={`rounded-full px-3 py-1 text-xs ring-1 ${
                i <= phaseIdx
                  ? 'bg-brand-50 text-brand-700 ring-brand-200'
                  : 'bg-neutral-50 text-neutral-400 ring-neutral-200'
              }`}
            >
              {PHASE_LABEL[p]}
            </span>
          ))}
        </div>
        {blocksTotal > 0 && (
          <div className="space-y-1">
            <p className="text-sm text-neutral-600">
              Прорабатываем блоки: {blocksDone} из {blocksTotal}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.round((blocksDone / blocksTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(stageTitles.length > 0 ? stageTitles : ['', '', '']).map((st, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: stages ordered by index; no stable id during stream
              key={`stage-${i}`}
              className="rounded-md bg-neutral-50 p-3 ring-1 ring-neutral-200"
            >
              <p className="text-sm font-medium text-neutral-800">{st || ' '}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
