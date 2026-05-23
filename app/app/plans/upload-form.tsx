'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useActionState, useState } from 'react'
import { type AnalyzeResult, analyzePlanAction, savePlanAction } from './actions'

const CONSENT_TEXT =
  'Вы отменяете обезличивание. Эти данные будут отправлены во внешний сервис GigaChat. Продолжить?'

export function UploadPlanForm() {
  const [analyze, analyzeAction, analyzing] = useActionState<AnalyzeResult, FormData>(
    analyzePlanAction,
    {},
  )
  const [save, saveFormAction, saving] = useActionState<{ error?: string }, FormData>(
    savePlanAction,
    {},
  )
  const [useOriginal, setUseOriginal] = useState(false)
  const [consent, setConsent] = useState(false)

  const ok = analyze.ok
  const hasPii = ok ? ok.replacements.length > 0 : false

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-xs text-accent-700">
            🛡 Локальный детект ПДн — GigaChat получает только обезличенный текст
          </p>
          <form action={analyzeAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              name="file"
              accept=".pdf,.docx,.txt"
              className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:text-brand-700 file:transition-colors hover:file:bg-brand-100"
            />
            <Button type="submit" disabled={analyzing}>
              {analyzing ? 'Анализируем…' : 'Загрузить план'}
            </Button>
          </form>
          {analyze.error && <p className="mt-2 text-sm text-error">{analyze.error}</p>}
        </CardContent>
      </Card>

      {ok && (
        <Card className="animate-fade-up">
          <CardContent className="space-y-4 pt-6">
            <h3 className="text-lg font-semibold text-neutral-900">
              {hasPii
                ? `Найдено персональных данных: ${ok.replacements.length}`
                : 'Персональные данные не найдены'}
            </h3>

            {hasPii && (
              <div className="space-y-1 rounded-md bg-neutral-50 p-3 text-sm ring-1 ring-neutral-200">
                {ok.replacements.map((r) => (
                  <div key={r.placeholder} className="flex items-center gap-2">
                    <span className="rounded bg-error/10 px-1.5 text-error line-through">
                      {r.original}
                    </span>
                    <span className="text-neutral-400">→</span>
                    <span className="rounded bg-accent-50 px-1.5 text-accent-700">
                      {r.placeholder}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form action={saveFormAction} className="space-y-3">
              <input type="hidden" name="filename" value={ok.filename} />
              <input type="hidden" name="originalText" value={ok.original} />
              <input type="hidden" name="useOriginal" value={useOriginal ? 'on' : 'off'} />
              <input type="hidden" name="consent" value={consent ? 'on' : 'off'} />

              {hasPii && (
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={useOriginal}
                    onChange={(e) => setUseOriginal(e.target.checked)}
                    className="mt-0.5"
                  />
                  Сохранить план без обезличивания (опасно)
                </label>
              )}

              {hasPii && useOriginal && (
                <label className="flex items-start gap-2 rounded-md bg-error/5 p-3 text-sm text-error ring-1 ring-error/20">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  {CONSENT_TEXT} Понимаю.
                </label>
              )}

              {save.error && <p className="text-sm text-error">{save.error}</p>}

              <Button type="submit" disabled={saving || (useOriginal && !consent)}>
                {saving
                  ? 'Сохраняем…'
                  : useOriginal
                    ? 'Сохранить как есть'
                    : 'Сохранить обезличенный план'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
