'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DIRECTIONS, DURATIONS, FORMATS, GRADES } from '@/lib/scenario/options'
import { useActionState } from 'react'
import { type NewScenarioState, generateScenarioAction } from './actions'

const selectClass =
  'flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'

export default function NewScenarioPage() {
  const [state, formAction, pending] = useActionState<NewScenarioState, FormData>(
    generateScenarioAction,
    null,
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold text-neutral-900">Новый сценарий</h1>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>Параметры занятия</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
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
              />
            </div>

            {state?.error && <p className="text-sm text-error">{state.error}</p>}

            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Генерируем… (до 30 секунд)' : 'Сгенерировать сценарий'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
