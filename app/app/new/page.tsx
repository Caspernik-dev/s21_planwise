'use client'

import { SharedCard } from '@/components/community/SharedCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DIRECTIONS, DURATIONS, FORMATS, GRADES } from '@/lib/scenario/options'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState, useRef, useState, useTransition } from 'react'
import {
  type NewScenarioState,
  type PrematchCard,
  generateScenarioAction,
  prematchAction,
} from './actions'

const selectClass =
  'flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'

function NewScenarioForm() {
  const sp = useSearchParams()
  const topic = sp.get('topic') ?? ''
  const planTopicId = sp.get('planTopicId') ?? ''
  const [state, formAction, pending] = useActionState<NewScenarioState, FormData>(
    generateScenarioAction,
    null,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const [matches, setMatches] = useState<PrematchCard[] | null>(null)
  const [matching, startMatch] = useTransition()

  function onPrematch() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    startMatch(async () => {
      const found = await prematchAction(fd)
      if (found.length === 0) {
        formRef.current?.requestSubmit()
      } else {
        setMatches(found)
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold text-neutral-900">Новый сценарий</h1>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>Параметры занятия</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-4">
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
                <Label htmlFor="grade">Класс</Label>
                <select id="grade" name="grade" required className={selectClass} defaultValue="5">
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g} класс
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

            <div className="space-y-1.5">
              <Label htmlFor="topic">Тема</Label>
              <Input
                id="topic"
                name="topic"
                required
                maxLength={200}
                placeholder="Например: Дружба и взаимопомощь"
                defaultValue={topic}
              />
            </div>

            {state?.error && <p className="text-sm text-error">{state.error}</p>}

            {planTopicId && <input type="hidden" name="planTopicId" value={planTopicId} />}

            {pending ? (
              <Button type="submit" disabled size="lg" className="w-full">
                Генерируем… (до 30 секунд)
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onPrematch}
                disabled={matching}
                size="lg"
                className="w-full"
              >
                {matching ? 'Ищем похожие…' : 'Подобрать похожие'}
              </Button>
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
            <Button
              type="button"
              disabled={pending}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {pending ? 'Генерируем…' : 'Сгенерировать новый'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setMatches(null)}
            >
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
