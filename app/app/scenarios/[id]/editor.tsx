'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { moveActivity, moveStage } from '@/lib/scenario/edit-ops'
import type { ScenarioContent } from '@/lib/scenario/schema'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { regenerateActivityAction, saveScenarioAction } from './actions'

const KIND_LABEL: Record<string, string> = {
  engage: 'Вовлечение',
  main: 'Основная часть',
  reflection: 'Рефлексия',
}

type Meta = { id: string; direction: string; grade: number; durationMin: number; format: string }

export function ScenarioEditor({
  meta,
  initialContent,
}: {
  meta: Meta
  initialContent: ScenarioContent
}) {
  const [content, setContent] = useState<ScenarioContent>(initialContent)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialContent))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [regenKey, setRegenKey] = useState<string | null>(null)

  const dirty = JSON.stringify(content) !== savedJson

  function update(fn: (c: ScenarioContent) => ScenarioContent) {
    setMessage(null)
    setContent((c) => fn(c))
  }

  function setStage(i: number, patch: Partial<ScenarioContent['stages'][number]>) {
    update((c) => {
      const stages = c.stages.slice()
      stages[i] = { ...stages[i], ...patch }
      return { ...c, stages }
    })
  }

  function setActivity(
    si: number,
    ai: number,
    patch: Partial<ScenarioContent['stages'][number]['activities'][number]>,
  ) {
    update((c) => {
      const stages = c.stages.slice()
      const activities = stages[si].activities.slice()
      activities[ai] = { ...activities[ai], ...patch }
      stages[si] = { ...stages[si], activities }
      return { ...c, stages }
    })
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const res = await saveScenarioAction(meta.id, content)
      if (res.ok) {
        setSavedJson(JSON.stringify(content))
        setMessage('Сохранено')
      } else {
        setMessage(res.error)
      }
    })
  }

  function regen(si: number, ai: number) {
    const key = `${si}-${ai}`
    setRegenKey(key)
    setMessage(null)
    startTransition(async () => {
      const res = await regenerateActivityAction(meta.id, si, ai)
      if (res.ok) {
        setActivity(si, ai, res.activity)
      } else {
        setMessage(res.error)
      }
      setRegenKey(null)
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Input
            value={content.title}
            onChange={(e) => update((c) => ({ ...c, title: e.target.value }))}
            className="text-2xl font-semibold"
            aria-label="Название сценария"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[meta.direction, `${meta.grade} класс`, `${meta.durationMin} мин`, meta.format].map(
              (b) => (
                <span
                  key={b}
                  className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-200"
                >
                  {b}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/scenarios/${meta.id}/export?format=pdf`}>PDF</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/scenarios/${meta.id}/export?format=docx`}>DOCX</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app">К дашборду</Link>
            </Button>
          </div>
          {dirty && (
            <p className="text-xs text-neutral-500">
              Сохраните, чтобы экспорт включал последние изменения
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Цели</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {content.goals.map((g, i) => (
            <Input
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
              key={`goal-${i}`}
              value={g}
              aria-label={`Цель ${i + 1}`}
              onChange={(e) =>
                update((c) => {
                  const goals = c.goals.slice()
                  goals[i] = e.target.value
                  return { ...c, goals }
                })
              }
            />
          ))}
        </CardContent>
      </Card>

      {content.materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Материалы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.materials.map((m, i) => (
              <Input
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
                key={`mat-${i}`}
                value={m}
                aria-label={`Материал ${i + 1}`}
                onChange={(e) =>
                  update((c) => {
                    const materials = c.materials.slice()
                    materials[i] = e.target.value
                    return { ...c, materials }
                  })
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {content.stages.map((stage, si) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stages ordered by index; no stable id in schema
          <Card key={`stage-${si}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <Input
                  value={stage.title}
                  onChange={(e) => setStage(si, { title: e.target.value })}
                  className="text-base font-medium"
                  aria-label="Заголовок этапа"
                />
                <span className="flex shrink-0 items-center gap-2 text-sm font-normal text-neutral-500">
                  {KIND_LABEL[stage.kind] ?? stage.kind}
                  <Input
                    type="number"
                    min={1}
                    value={stage.duration_min}
                    onChange={(e) =>
                      setStage(si, { duration_min: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-16"
                    aria-label="Минут на этап"
                  />
                  мин
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={si === 0}
                    onClick={() => update((c) => moveStage(c, si, -1))}
                    aria-label="Этап выше"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={si === content.stages.length - 1}
                    onClick={() => update((c) => moveStage(c, si, 1))}
                    aria-label="Этап ниже"
                  >
                    ↓
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stage.activities.map((a, ai) => {
                const busy = pending && regenKey === `${si}-${ai}`
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: activities ordered by index; no stable id in schema
                  <div key={`act-${si}-${ai}`} className="rounded-md bg-neutral-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-neutral-400">
                        {a.type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={ai === 0}
                          onClick={() => update((c) => moveActivity(c, si, ai, -1))}
                          aria-label="Активность выше"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={ai === stage.activities.length - 1}
                          onClick={() => update((c) => moveActivity(c, si, ai, 1))}
                          aria-label="Активность ниже"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => regen(si, ai)}
                          aria-label="Заменить активность"
                        >
                          {busy ? '…' : '🎲'}
                        </Button>
                      </span>
                    </div>
                    <Textarea
                      value={a.text}
                      onChange={(e) => setActivity(si, ai, { text: e.target.value })}
                      aria-label="Текст активности"
                    />
                    {a.questions && a.questions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {a.questions.map((q, qi) => (
                          <Input
                            // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
                            key={`q-${si}-${ai}-${qi}`}
                            value={q}
                            onChange={(e) =>
                              setActivity(si, ai, {
                                questions: a.questions?.map((x, k) =>
                                  k === qi ? e.target.value : x,
                                ),
                              })
                            }
                            aria-label="Вопрос"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Адаптация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="font-medium text-neutral-900">Проще: </span>
            <Textarea
              value={content.adaptations.simpler}
              onChange={(e) =>
                update((c) => ({
                  ...c,
                  adaptations: { ...c.adaptations, simpler: e.target.value },
                }))
              }
              aria-label="Адаптация проще"
            />
          </div>
          <div>
            <span className="font-medium text-neutral-900">Сложнее: </span>
            <Textarea
              value={content.adaptations.harder}
              onChange={(e) =>
                update((c) => ({ ...c, adaptations: { ...c.adaptations, harder: e.target.value } }))
              }
              aria-label="Адаптация сложнее"
            />
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-neutral-500">
            {message ?? (dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}
          </span>
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {pending && regenKey === null ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
