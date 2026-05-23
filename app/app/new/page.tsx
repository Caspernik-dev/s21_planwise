'use client'

import { SharedCard } from '@/components/community/SharedCard'
import { GenerationStream } from '@/components/generation/GenerationStream'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { DIRECTIONS, DURATIONS, FORMATS, GRADES, formatGrade } from '@/lib/scenario/options'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState, useRef, useState, useTransition } from 'react'
import { type PrematchCard, prematchAction } from './actions'
import { type AnalyzeMaterialResult, analyzeMaterialAction } from './material-actions'

const selectClass =
  'flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'

function NewScenarioForm() {
  const sp = useSearchParams()
  const topic = sp.get('topic') ?? ''
  const planTopicId = sp.get('planTopicId') ?? ''
  const calendarDate = sp.get('calendarDate') ?? ''
  const formRef = useRef<HTMLFormElement>(null)
  const [source, setSource] = useState<'manual' | 'calendar' | 'plan'>(
    planTopicId ? 'plan' : calendarDate ? 'calendar' : 'manual',
  )
  const [topicValue, setTopicValue] = useState(topic)
  const [matches, setMatches] = useState<PrematchCard[] | null>(null)
  const [matching, startMatch] = useTransition()
  const [generating, setGenerating] = useState<Record<string, unknown> | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [materialAnalysis, materialAction, materialPending] = useActionState<
    AnalyzeMaterialResult,
    FormData
  >(analyzeMaterialAction, {})
  const [materialConsent, setMaterialConsent] = useState(false)

  function onGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const payload = {
      direction: fd.get('direction'),
      grade: fd.get('grade'),
      topic: fd.get('topic'),
      durationMin: fd.get('durationMin'),
      format: fd.get('format'),
      planTopicId: fd.get('planTopicId') || undefined,
      material: materialAnalysis.ok
        ? { text: materialAnalysis.ok.original, consent: materialConsent }
        : undefined,
    }
    if (!payload.topic || String(payload.topic).trim().length === 0) {
      setFormError('Укажите тему')
      return
    }
    setFormError(null)
    setGenerating(payload)
  }

  function onPrematch() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    startMatch(async () => {
      const found = await prematchAction(fd)
      if (found.length === 0) {
        onGenerate()
      } else {
        setMatches(found)
      }
    })
  }

  if (generating) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-semibold text-neutral-900">Новый сценарий</h1>
        <GenerationStream payload={generating} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold text-neutral-900">Новый сценарий</h1>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>Параметры занятия</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={onGenerate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="direction">Направление воспитания</Label>
              <select
                id="direction"
                name="direction"
                required
                className={selectClass}
                defaultValue={DIRECTIONS[0]}
              >
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="grade">Класс / аудитория</Label>
                <select id="grade" name="grade" required className={selectClass} defaultValue="5">
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {formatGrade(g)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="durationMin">Длительность</Label>
                <select
                  id="durationMin"
                  name="durationMin"
                  required
                  className={selectClass}
                  defaultValue="30"
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} минут
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="format">Формат</Label>
              <select
                id="format"
                name="format"
                required
                className={selectClass}
                defaultValue={FORMATS[0]}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              {(
                [
                  ['manual', 'Вручную'],
                  ['calendar', 'Календарь поводов'],
                  ...(planTopicId ? ([['plan', 'Из плана']] as const) : []),
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSource(v)}
                  className={`rounded-full px-3 py-1 text-sm ring-1 transition ${
                    source === v
                      ? 'bg-brand-500 text-white ring-brand-500'
                      : 'bg-neutral-0 text-neutral-600 ring-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {source === 'plan' && (
              <p className="rounded-md bg-accent-50 px-3 py-2 text-sm text-accent-700 ring-1 ring-accent-100">
                📋 Тема взята из плана воспитательной работы. Сгенерированный сценарий автоматически
                закроет эту тему в плане.
              </p>
            )}

            {source === 'calendar' && (
              <div className="space-y-1.5">
                <Label htmlFor="occasion">Повод</Label>
                <select
                  id="occasion"
                  className={selectClass}
                  defaultValue={CALENDAR_EVENTS.find((e) => e.date === calendarDate)?.title ?? ''}
                  onChange={(e) => setTopicValue(e.target.value)}
                >
                  <option value="">— выберите повод —</option>
                  {CALENDAR_EVENTS.map((o) => (
                    <option key={o.date} value={o.title}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="topic">Тема</Label>
              <Input
                id="topic"
                name="topic"
                required
                maxLength={200}
                placeholder="Например: Дружба и взаимопомощь"
                value={topicValue}
                onChange={(e) => setTopicValue(e.target.value)}
              />
            </div>

            {formError && <p className="text-sm text-error">{formError}</p>}

            {planTopicId && <input type="hidden" name="planTopicId" value={planTopicId} />}

            <Button
              type="button"
              onClick={onPrematch}
              disabled={matching}
              size="lg"
              className="w-full"
            >
              {matching ? 'Ищем похожие…' : 'Подобрать похожие'}
            </Button>
          </form>

          <form
            action={materialAction}
            className="mt-4 space-y-3 rounded-lg p-4 ring-1 ring-neutral-200"
          >
            <Label htmlFor="material">Свой материал (необязательно)</Label>
            <p className="text-sm text-neutral-500">
              Прикрепите статью, конспект или заметки (PDF, DOCX, TXT, до 5 МБ) — сценарий будет
              построен прежде всего на нём.
            </p>
            <input
              id="material"
              name="material"
              type="file"
              accept=".pdf,.docx,.txt"
              className="block cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700 hover:file:bg-brand-100"
            />
            <Button type="submit" variant="outline" disabled={materialPending}>
              {materialPending ? 'Анализ…' : 'Проанализировать материал'}
            </Button>
            {materialAnalysis.error && (
              <p className="text-sm text-error">{materialAnalysis.error}</p>
            )}
            {materialAnalysis.ok && (
              <div className="space-y-2 text-sm">
                <p className="text-neutral-700">
                  Файл: <strong>{materialAnalysis.ok.filename}</strong>.{' '}
                  {materialAnalysis.ok.replacements.length > 0
                    ? `Найдено персональных данных: ${materialAnalysis.ok.replacements.length}. По умолчанию они будут обезличены.`
                    : 'Персональные данные не найдены.'}
                </p>
                {materialAnalysis.ok.replacements.length > 0 && (
                  <>
                    <ul className="list-disc pl-5 text-neutral-600">
                      {materialAnalysis.ok.replacements.slice(0, 10).map((r, i) => (
                        <li key={`${i}-${r.placeholder}`}>
                          <span className="line-through">{r.original}</span> → {r.placeholder}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={materialConsent}
                        onChange={(e) => setMaterialConsent(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-neutral-700">
                        Я понимаю, что эти данные будут отправлены во внешний сервис GigaChat без
                        обезличивания. Продолжить.
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {matches && matches.length > 0 && (
        <section className="mt-8 animate-fade-up space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900">Похожие сценарии сообщества</h2>
          <p className="text-sm text-neutral-600">
            Можно взять готовый сценарий как есть — будет создана ваша копия для редактирования, —
            или сгенерировать новый.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {matches.map((card) => (
              <SharedCard key={card.id} {...card} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => onGenerate()}>
              Сгенерировать новый
            </Button>
            <Button type="button" variant="outline" onClick={() => setMatches(null)}>
              Изменить параметры
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

export default function NewScenarioPage() {
  return (
    <Suspense>
      <NewScenarioForm />
    </Suspense>
  )
}
