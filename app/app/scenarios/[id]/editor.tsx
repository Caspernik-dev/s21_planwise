'use client'

import { bindScenarioAction } from '@/app/app/calendar/actions'
import { LikeShareControls } from '@/components/community/LikeShareControls'
import { RatingControls } from '@/components/generation/RatingControls'
import { PresentationMode } from '@/components/scenario/PresentationMode'
import { VersionHistory } from '@/components/scenario/VersionHistory'
import { ShareLinkControls } from '@/components/share/ShareLinkControls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  addActivity,
  addStage,
  moveActivity,
  moveStage,
  removeActivity,
  removeStage,
} from '@/lib/scenario/edit-ops'
import { gradeToLevel, levelLabel } from '@/lib/scenario/levels'
import {
  LITERACY_KINDS,
  type LessonType,
  type LiteracyKind,
  formatGrade,
  lessonTypeLabel,
} from '@/lib/scenario/options'
import {
  formatLessonDateRu,
  isMonday,
  nearestMonday,
  rovLessonNumber,
} from '@/lib/scenario/rov-date'
import { buildSearchUrl } from '@/lib/scenario/rutube'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { DIRECTION_TO_LEADING_VALUE, VALUES_809, type Value809 } from '@/lib/scenario/values-809'
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

type Meta = {
  id: string
  topic: string
  direction: string
  grade: number
  durationMin: number
  format: string
  lessonType: LessonType
}

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

  function applyRestored(restored: ScenarioContent) {
    setMessage('Версия восстановлена')
    setContent(restored)
    setSavedJson(JSON.stringify(restored))
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
            {[
              lessonTypeLabel(meta.lessonType),
              ...(meta.lessonType === 'rov' || meta.lessonType === 'event' ? [meta.direction] : []),
              formatGrade(meta.grade),
              `${meta.durationMin} мин`,
              meta.format,
            ].map((b) => (
              <span
                key={b}
                className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-200"
              >
                {b}
              </span>
            ))}
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
            <PresentationMode
              content={content}
              meta={{
                direction: meta.direction,
                grade: meta.grade,
                durationMin: meta.durationMin,
                format: meta.format,
              }}
            />
            <VersionHistory
              scenarioId={meta.id}
              meta={{
                topic: meta.topic,
                direction: meta.direction,
                grade: meta.grade,
                durationMin: meta.durationMin,
                format: meta.format,
                lessonType: meta.lessonType,
              }}
              onRestore={applyRestored}
            />
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
          <CardTitle>Цель и задачи</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="mb-2 text-xs italic text-neutral-500">
            Первая строка — цель занятия (одна ведущая). Остальные — задачи (опционально).
          </p>
          {content.goals.map((g, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
            <div key={`goal-${i}`} className="flex gap-2">
              <Input
                value={g}
                aria-label={i === 0 ? 'Цель занятия' : `Задача ${i}`}
                placeholder={i === 0 ? 'Цель занятия (одна ведущая)' : 'Задача (опционально)'}
                onChange={(e) =>
                  update((c) => {
                    const goals = c.goals.slice()
                    goals[i] = e.target.value
                    return { ...c, goals }
                  })
                }
              />
              {/* удалить можно только задачи (i>0): цель должна остаться по схеме (min 1) */}
              {i > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    update((c) => ({
                      ...c,
                      goals: c.goals.filter((_, j) => j !== i),
                    }))
                  }
                  aria-label={`Удалить задачу ${i}`}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update((c) => ({ ...c, goals: [...c.goals, ''] }))}
          >
            + Добавить задачу
          </Button>
        </CardContent>
      </Card>

      {(meta.lessonType === 'rov' || meta.lessonType === 'event') && (
        <Card>
          <CardHeader>
            <CardTitle>Направление воспитания</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500">{meta.direction}</p>
          </CardContent>
        </Card>
      )}
      {meta.lessonType === 'subject_extension' && (
        <Card>
          <CardHeader>
            <CardTitle>Предмет</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={content.subject ?? ''}
              onChange={(e) => update((c) => ({ ...c, subject: e.target.value }))}
              placeholder="Физика, Биология, Математика..."
              aria-label="Школьный предмет"
            />
          </CardContent>
        </Card>
      )}
      {meta.lessonType === 'literacy' && (
        <Card>
          <CardHeader>
            <CardTitle>Вид грамотности</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={content.literacyKind ?? ''}
              onChange={(e) =>
                update((c) => ({ ...c, literacyKind: e.target.value as LiteracyKind }))
              }
              aria-label="Вид грамотности"
            >
              <option value="">— выберите —</option>
              {LITERACY_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Метапредметные результаты (УУД)</CardTitle>
          <p className="text-sm text-neutral-500">
            Универсальные учебные действия по ФГОС {levelLabel(gradeToLevel(meta.grade))}: три
            группы.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {(
            [
              { key: 'cognitive', label: 'Познавательные УУД' },
              { key: 'communicative', label: 'Коммуникативные УУД' },
              { key: 'regulatory', label: 'Регулятивные УУД' },
            ] as const
          ).map((group) => {
            const items = content.metaSubjectResults?.[group.key] ?? []
            return (
              <div key={group.key} className="space-y-2">
                <div className="text-sm font-medium text-neutral-700">{group.label}</div>
                {items.map((r, i) => (
                  <div key={`${group.key}-${i}`} className="flex gap-2">
                    <Textarea
                      value={r}
                      onChange={(e) =>
                        update((c) => {
                          const msr = { ...(c.metaSubjectResults ?? {}) }
                          const arr = (msr[group.key] ?? []).slice()
                          arr[i] = e.target.value
                          msr[group.key] = arr
                          return { ...c, metaSubjectResults: msr }
                        })
                      }
                      rows={2}
                      className="flex-1"
                      aria-label={`${group.label} ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update((c) => {
                          const msr = { ...(c.metaSubjectResults ?? {}) }
                          msr[group.key] = (msr[group.key] ?? []).filter((_, k) => k !== i)
                          return { ...c, metaSubjectResults: msr }
                        })
                      }
                      aria-label={`Удалить: ${group.label.toLowerCase()}`}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((c) => {
                      const msr = { ...(c.metaSubjectResults ?? {}) }
                      msr[group.key] = [...(msr[group.key] ?? []), '']
                      return { ...c, metaSubjectResults: msr }
                    })
                  }
                >
                  + Добавить
                </Button>
              </div>
            )
          })}
          {content.metaResults && content.metaResults.length > 0 ? (
            <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs text-neutral-600">
                Из старой версии сценария (плоский список). Перенесите в нужные группы выше и
                удалите.
              </div>
              {content.metaResults.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
                <div key={`legacy-mr-${i}`} className="flex gap-2">
                  <Textarea
                    value={r}
                    onChange={(e) =>
                      update((c) => {
                        const metaResults = (c.metaResults ?? []).slice()
                        metaResults[i] = e.target.value
                        return { ...c, metaResults }
                      })
                    }
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update((c) => ({
                        ...c,
                        metaResults: (c.metaResults ?? []).filter((_, k) => k !== i),
                      }))
                    }
                    aria-label="Удалить устаревший пункт"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {meta.lessonType !== 'rov' && meta.lessonType !== 'event' ? (
        <Card>
          <CardHeader>
            <CardTitle>Планируемые предметные результаты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(content.subjectResults ?? []).map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
              <div key={`sr-${i}`} className="flex gap-2">
                <Textarea
                  value={r}
                  onChange={(e) =>
                    update((c) => {
                      const subjectResults = (c.subjectResults ?? []).slice()
                      subjectResults[i] = e.target.value
                      return { ...c, subjectResults }
                    })
                  }
                  rows={2}
                  className="flex-1"
                  aria-label={`Предметный результат ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((c) => ({
                      ...c,
                      subjectResults: (c.subjectResults ?? []).filter((_, k) => k !== i),
                    }))
                  }
                  aria-label="Удалить предметный результат"
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                update((c) => ({ ...c, subjectResults: [...(c.subjectResults ?? []), ''] }))
              }
            >
              + Добавить
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Планируемые личностные результаты</CardTitle>
          {meta.lessonType === 'rov' || meta.lessonType === 'event' ? (
            <p className="text-sm text-neutral-500">
              Из ФГОС {levelLabel(gradeToLevel(meta.grade))}, направление «{meta.direction}»
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Свободный список, не из каталога ФГОС.</p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {(content.personalResults ?? []).map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered string array, no stable id
            <div key={`pr-${i}`} className="flex gap-2">
              <Textarea
                value={r}
                onChange={(e) =>
                  update((c) => {
                    const personalResults = (c.personalResults ?? []).slice()
                    personalResults[i] = e.target.value
                    return { ...c, personalResults }
                  })
                }
                rows={2}
                className="flex-1"
                aria-label={`Личностный результат ${i + 1}`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update((c) => ({
                    ...c,
                    personalResults: (c.personalResults ?? []).filter((_, k) => k !== i),
                  }))
                }
                aria-label="Удалить личностный результат"
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update((c) => ({
                ...c,
                personalResults: [...(c.personalResults ?? []), ''],
              }))
            }
          >
            + Добавить
          </Button>
        </CardContent>
      </Card>

      {meta.lessonType === 'rov' && (
        <Card>
          <CardHeader>
            <CardTitle>Дата проведения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              type="date"
              value={content.lessonDate ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  update((c) => ({ ...c, lessonDate: undefined }))
                  return
                }
                const snap = isMonday(v) ? v : nearestMonday(v)
                update((c) => ({ ...c, lessonDate: snap }))
              }}
              className="flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
            {content.lessonDate && isMonday(content.lessonDate) && (
              <p className="text-xs text-neutral-500">
                {formatLessonDateRu(content.lessonDate)}
                {(() => {
                  const n = rovLessonNumber(content.lessonDate)
                  return n !== null ? ` (занятие №${n} цикла)` : ''
                })()}
              </p>
            )}
            {content.lessonDate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update((c) => ({ ...c, lessonDate: undefined }))}
              >
                Очистить
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {meta.lessonType === 'rov' && (
        <Card>
          <CardHeader>
            <CardTitle>Формируемые ценности</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {content.values &&
              content.values.length > 0 &&
              !content.leadingValue &&
              (!content.valueFormulations || content.valueFormulations.length === 0) && (
                <div className="mb-4 rounded-md bg-warm-50 p-3 text-sm text-warm-700 ring-1 ring-warm-100">
                  <p className="mb-2">
                    <strong>Унаследованный формат:</strong> {content.values.join('; ')}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update((c) => {
                        const fallback: Value809 =
                          (DIRECTION_TO_LEADING_VALUE as Record<string, Value809>)[
                            meta.direction
                          ] ?? VALUES_809[0]
                        const formulations = (c.values ?? []).map((t) => ({
                          text: t,
                          basedOn: fallback,
                        }))
                        return {
                          ...c,
                          values: [],
                          leadingValue: fallback,
                          valueFormulations: formulations,
                        }
                      })
                    }
                  >
                    Конвертировать в новый формат
                  </Button>
                </div>
              )}

            <div className="space-y-1.5">
              <Label htmlFor="leadingValue">Ведущая ценность (из Указа № 809)</Label>
              <select
                id="leadingValue"
                value={content.leadingValue ?? ''}
                onChange={(e) =>
                  update((c) => ({ ...c, leadingValue: e.target.value || undefined }))
                }
                className="flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <option value="">— не выбрано —</option>
                {VALUES_809.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Сопутствующие ценности (до 3, кроме ведущей)</Label>
              <div className="space-y-2">
                {[0, 1, 2].map((i) => {
                  const sv = content.secondaryValues ?? []
                  const current = sv[i] ?? ''
                  const taken = new Set(
                    [content.leadingValue, ...sv.filter((_, j) => j !== i)].filter(Boolean),
                  )
                  return (
                    <select
                      key={i}
                      value={current}
                      onChange={(e) => {
                        update((c) => {
                          const next = [...(c.secondaryValues ?? [])]
                          const val = e.target.value
                          if (!val) {
                            next.splice(i, 1)
                          } else {
                            next[i] = val
                          }
                          return { ...c, secondaryValues: next.filter(Boolean) as Value809[] }
                        })
                      }}
                      className="flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <option value="">— не выбрано —</option>
                      {VALUES_809.filter((v) => v === current || !taken.has(v)).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Формулировки темы (связаны с одной из базовых)</Label>
              <p className="text-xs italic text-neutral-500">
                Например: «Родина» (патриотизм). Каждая формулировка должна ссылаться на одну из 17
                базовых ценностей.
              </p>
              <div className="space-y-2">
                {(content.valueFormulations ?? []).map((f, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: ordered array, no stable id
                  <div key={i} className="flex gap-2">
                    <Textarea
                      rows={2}
                      className="flex-1"
                      placeholder="живая формулировка"
                      value={f.text}
                      onChange={(e) =>
                        update((c) => {
                          const arr = [...(c.valueFormulations ?? [])]
                          arr[i] = { ...arr[i], text: e.target.value }
                          return { ...c, valueFormulations: arr }
                        })
                      }
                    />
                    <select
                      value={f.basedOn}
                      onChange={(e) =>
                        update((c) => {
                          const arr = [...(c.valueFormulations ?? [])]
                          arr[i] = { ...arr[i], basedOn: e.target.value as Value809 }
                          return { ...c, valueFormulations: arr }
                        })
                      }
                      className="flex h-10 w-48 rounded-md bg-neutral-0 px-2 text-sm ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {VALUES_809.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        update((c) => ({
                          ...c,
                          valueFormulations: (c.valueFormulations ?? []).filter((_, j) => j !== i),
                        }))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                {(content.valueFormulations?.length ?? 0) < 8 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      update((c) => ({
                        ...c,
                        valueFormulations: [
                          ...(c.valueFormulations ?? []),
                          { text: '', basedOn: VALUES_809[0] },
                        ],
                      }))
                    }
                  >
                    + Добавить формулировку
                  </Button>
                )}
              </div>
            </div>
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
                    {a.type === 'video' && (
                      <div className="mt-2 space-y-1.5 rounded-md bg-brand-50 p-3 ring-1 ring-brand-100">
                        <Label htmlFor={`videoQuery-${si}-${ai}`}>Поисковой запрос на RuTube</Label>
                        <Input
                          id={`videoQuery-${si}-${ai}`}
                          placeholder="3-5 ключевых слов: «Дружба школьники мультфильм»"
                          value={a.videoSearchQuery ?? ''}
                          onChange={(e) =>
                            setActivity(si, ai, {
                              videoSearchQuery: e.target.value || undefined,
                            })
                          }
                          aria-label="Поисковой запрос на RuTube"
                        />
                        {a.videoSearchQuery && a.videoSearchQuery.trim() !== '' && (
                          <a
                            href={buildSearchUrl(a.videoSearchQuery)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-brand-700 underline hover:text-brand-800"
                          >
                            🔍 Открыть на RuTube
                          </a>
                        )}
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
