'use client'

import { bindScenarioAction } from '@/app/app/calendar/actions'
import { LikeShareControls } from '@/components/community/LikeShareControls'
import { RatingControls } from '@/components/generation/RatingControls'
import { ShareLinkControls } from '@/components/share/ShareLinkControls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  addActivity,
  addStage,
  moveActivity,
  moveStage,
  removeActivity,
  removeStage,
} from '@/lib/scenario/edit-ops'
import { formatGrade } from '@/lib/scenario/options'
import type { ScenarioContent } from '@/lib/scenario/schema'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { regenerateActivityAction, saveScenarioAction } from './actions'

const KIND_LABEL: Record<string, string> = {
  engage: 'Вовлечение',
  main: 'Основная часть',
  reflection: 'Рефлексия',
}

const ACTIVITY_TYPE_LABELS: Array<{ value: string; label: string }> = [
  { value: 'discussion', label: 'Беседа / обсуждение' },
  { value: 'quiz', label: 'Квиз' },
  { value: 'game', label: 'Игра' },
  { value: 'task', label: 'Задание' },
  { value: 'video', label: 'Видео / презентация' },
]

type Meta = { id: string; direction: string; grade: number; durationMin: number; format: string }

export function ScenarioEditor({
  meta,
  initialContent,
  initialLiked,
  initialShared,
  initialShareToken,
  initialRating,
  initialFeedback,
}: {
  meta: Meta
  initialContent: ScenarioContent
  initialLiked: boolean
  initialShared: boolean
  initialShareToken: string | null
  initialRating: number | null
  initialFeedback: string | null
}) {
  const [content, setContent] = useState<ScenarioContent>(initialContent)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialContent))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [piiWarning, setPiiWarning] = useState<string | null>(null)
  const [regenKey, setRegenKey] = useState<string | null>(null)
  const [regenType, setRegenType] = useState<Record<string, string>>({})
  const [eventDate, setEventDate] = useState('')
  const [calNote, setCalNote] = useState<string | null>(null)

  const dirty = JSON.stringify(content) !== savedJson

  function bindToDate() {
    if (!eventDate) return
    setCalNote(null)
    startTransition(async () => {
      const res = await bindScenarioAction(meta.id, eventDate)
      setCalNote(res.ok ? 'Сценарий привязан к календарю' : res.error)
    })
  }

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
      setPiiWarning(res.ok ? (res.piiWarning ?? null) : null)
      if (res.ok) {
        setSavedJson(JSON.stringify(content))
        setMessage('Сохранено')
      } else {
        setMessage(res.error)
      }
    })
  }

  function regen(si: number, ai: number, type: string) {
    const key = `${si}-${ai}`
    setRegenKey(key)
    setMessage(null)
    startTransition(async () => {
      const res = await regenerateActivityAction(meta.id, si, ai, type)
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
      <div className="rounded-md bg-warm-50 px-4 py-3 text-sm text-warm-700 ring-1 ring-warm-200">
        ⚠ Сценарий создан ИИ. Перед уроком проверьте факты — даты, имена, цитаты, числа.
      </div>
      {piiWarning && (
        <div className="rounded-md bg-warm-50 px-4 py-3 text-sm text-warm-700 ring-1 ring-warm-200">
          {piiWarning}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Input
            value={content.title}
            onChange={(e) => update((c) => ({ ...c, title: e.target.value }))}
            className="text-2xl font-semibold"
            aria-label="Название сценария"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[meta.direction, formatGrade(meta.grade), `${meta.durationMin} мин`, meta.format].map(
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
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="h-9 rounded-md px-2 text-sm ring-1 ring-neutral-200"
              aria-label="Дата для привязки к календарю"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !eventDate}
              onClick={bindToDate}
            >
              На дату
            </Button>
          </div>
          {calNote && <span className="text-sm text-brand-700">{calNote}</span>}
          <LikeShareControls
            scenarioId={meta.id}
            initialLiked={initialLiked}
            initialShared={initialShared}
          />
          <ShareLinkControls scenarioId={meta.id} initialToken={initialShareToken} />
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

      {content.values && content.values.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Формируемые ценности</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.values.map((v, i) => (
              <Input
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
                key={`val-${i}`}
                value={v}
                aria-label={`Ценность ${i + 1}`}
                onChange={(e) =>
                  update((c) => {
                    const values = (c.values ?? []).slice()
                    values[i] = e.target.value
                    return { ...c, values }
                  })
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      {content.coreMeanings && content.coreMeanings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Основные смыслы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.coreMeanings.map((m, i) => (
              <Textarea
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
                key={`cm-${i}`}
                value={m}
                aria-label={`Основной смысл ${i + 1}`}
                onChange={(e) =>
                  update((c) => {
                    const coreMeanings = (c.coreMeanings ?? []).slice()
                    coreMeanings[i] = e.target.value
                    return { ...c, coreMeanings }
                  })
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={content.stages.length <= 1}
                    onClick={() => update((c) => removeStage(c, si))}
                    aria-label="Удалить этап"
                  >
                    Удалить
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
                        <select
                          className="rounded-md border border-neutral-200 bg-neutral-0 px-2 py-1 text-xs text-neutral-700"
                          value={regenType[`${si}-${ai}`] ?? a.type}
                          disabled={pending}
                          onChange={(e) =>
                            setRegenType((m) => ({ ...m, [`${si}-${ai}`]: e.target.value }))
                          }
                          aria-label="Тип для регенерации"
                        >
                          {ACTIVITY_TYPE_LABELS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => regen(si, ai, regenType[`${si}-${ai}`] ?? a.type)}
                          aria-label="Заменить активность"
                        >
                          {busy ? '…' : '🎲'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={stage.activities.length <= 1}
                          onClick={() => update((c) => removeActivity(c, si, ai))}
                          aria-label="Удалить активность"
                        >
                          ✕
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => update((c) => addActivity(c, si))}
              >
                + Активность
              </Button>
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" onClick={() => update((c) => addStage(c))}>
          + Добавить этап
        </Button>
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

      <RatingControls
        scenarioId={meta.id}
        initialRating={initialRating}
        initialFeedback={initialFeedback}
      />

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
