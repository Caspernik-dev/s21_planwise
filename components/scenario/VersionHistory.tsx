'use client'

import {
  type VersionListItem,
  getVersionAction,
  listVersionsAction,
  restoreVersionAction,
} from '@/app/app/scenarios/[id]/actions'
import { ScenarioReadOnly } from '@/components/share/ScenarioReadOnly'
import { Button } from '@/components/ui/button'
import { type ExportMeta, buildScenarioDocument } from '@/lib/export/document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { useState, useTransition } from 'react'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VersionHistory({
  scenarioId,
  meta,
  onRestore,
}: {
  scenarioId: string
  meta: ExportMeta
  onRestore: (content: ScenarioContent) => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionListItem[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ScenarioContent | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openPanel() {
    setOpen(true)
    setError(null)
    setSelectedId(null)
    setPreview(null)
    setConfirming(false)
    startTransition(async () => {
      const res = await listVersionsAction(scenarioId)
      if (res.ok) setVersions(res.versions)
      else setError(res.error)
    })
  }

  function selectVersion(id: string) {
    setSelectedId(id)
    setPreview(null)
    setConfirming(false)
    setError(null)
    startTransition(async () => {
      const res = await getVersionAction(scenarioId, id)
      if (res.ok) setPreview(res.content)
      else setError(res.error)
    })
  }

  function restore(id: string) {
    startTransition(async () => {
      const res = await restoreVersionAction(scenarioId, id)
      if (res.ok) {
        onRestore(res.content)
        setOpen(false)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openPanel}>
        История
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-neutral-900/30">
          <button
            type="button"
            aria-label="Закрыть"
            className="flex-1"
            onClick={() => setOpen(false)}
          />
          <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-neutral-200 border-b px-5 py-4">
              <h2 className="font-semibold text-lg text-neutral-900">История версий</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Закрыть
              </Button>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="w-56 shrink-0 overflow-y-auto border-neutral-200 border-r">
                {versions === null && <p className="p-4 text-neutral-500 text-sm">Загрузка…</p>}
                {versions?.length === 0 && (
                  <p className="p-4 text-neutral-500 text-sm">Версий пока нет.</p>
                )}
                <ul>
                  {versions?.map((v, i) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => selectVersion(v.id)}
                        className={`w-full border-neutral-100 border-b px-4 py-3 text-left text-sm hover:bg-brand-50 ${
                          selectedId === v.id ? 'bg-brand-50 text-brand-700' : 'text-neutral-700'
                        }`}
                      >
                        <span className="block font-medium">
                          Версия {versions.length - i}
                          {i === 0 && <span className="ml-2 text-brand-600 text-xs">текущая</span>}
                        </span>
                        <span className="text-neutral-500 text-xs">{formatWhen(v.createdAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto p-5">
                {error && <p className="text-sm text-warm-700">{error}</p>}
                {!selectedId && !error && (
                  <p className="text-neutral-500 text-sm">
                    Выберите версию слева, чтобы посмотреть её содержимое.
                  </p>
                )}
                {selectedId && !preview && !error && (
                  <p className="text-neutral-500 text-sm">Загрузка…</p>
                )}
                {selectedId && preview && (
                  <div className="space-y-4">
                    {confirming ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-md bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
                        <span className="text-brand-800 text-sm">
                          Точно восстановить? Текущее состояние сохранится в истории.
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => restore(selectedId)}
                          >
                            Да, восстановить
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirming(false)}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirming(true)}
                      >
                        Восстановить эту версию
                      </Button>
                    )}
                    <ScenarioReadOnly
                      blocks={buildScenarioDocument(preview, {
                        ...meta,
                        topic: meta.topic || preview.title,
                      })}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
