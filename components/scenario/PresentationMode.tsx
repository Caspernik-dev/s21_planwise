'use client'

import { Button } from '@/components/ui/button'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { type Slide, buildSlides } from '@/lib/scenario/slides'
import { useCallback, useEffect, useRef, useState } from 'react'

type Meta = { direction: string; grade: number; durationMin: number; format: string }

export function PresentationMode({ content, meta }: { content: ScenarioContent; meta: Meta }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [slides, setSlides] = useState<Slide[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  )
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  function start() {
    setSlides(buildSlides(content, meta))
    setIndex(0)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    containerRef.current?.requestFullscreen?.().catch(() => {})
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        prev()
      } else if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, prev, close])

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={start}>
        Показ
      </Button>
    )
  }

  const slide = slides[index]

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-50 text-neutral-900"
    >
      <div className="flex items-center justify-end px-6 py-4">
        <Button type="button" variant="outline" size="sm" onClick={close}>
          ✕ Выйти
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-4">
        <div className="w-full max-w-4xl">
          {slide?.kind === 'title' && (
            <div className="text-center">
              <h1 className="font-semibold text-5xl text-brand-800 leading-tight">{slide.title}</h1>
              <div className="mt-8 flex flex-wrap justify-center gap-3 text-lg">
                {slide.badges.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-brand-50 px-5 py-2 text-brand-700 ring-1 ring-brand-200"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {slide?.kind === 'stage' && (
            <div>
              <div className="flex items-baseline justify-between gap-4 border-brand-200 border-b pb-4">
                <h2 className="font-semibold text-4xl text-brand-800">{slide.title}</h2>
                <span className="shrink-0 text-2xl text-neutral-500">{slide.durationMin} мин</span>
              </div>
              <div className="mt-8 space-y-8">
                {slide.blocks.map((block, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
                  <div key={i}>
                    <h3 className="font-medium text-2xl text-accent-700">{block.typeLabel}</h3>
                    {block.questions && (
                      <ul className="mt-4 space-y-3 text-3xl leading-relaxed">
                        {block.questions.map((q) => (
                          <li key={q} className="flex gap-3">
                            <span className="text-brand-500">•</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {block.text && (
                      <p className="mt-4 whitespace-pre-wrap text-2xl text-neutral-700 leading-relaxed">
                        {block.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-8 py-5">
        <Button type="button" variant="outline" onClick={prev} disabled={index === 0}>
          ← Назад
        </Button>
        <span className="text-neutral-500 text-sm">
          {index + 1} / {slides.length}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={next}
          disabled={index === slides.length - 1}
        >
          Далее →
        </Button>
      </div>
    </div>
  )
}
