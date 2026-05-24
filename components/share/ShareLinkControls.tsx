'use client'

import { disableShareLinkAction, enableShareLinkAction } from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { useState, useTransition } from 'react'

export function ShareLinkControls({
  scenarioId,
  initialToken,
}: { scenarioId: string; initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [pii, setPii] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const url = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${token}`
    : ''

  function enable() {
    setPii(null)
    start(async () => {
      const res = await enableShareLinkAction(scenarioId)
      if (res.ok) {
        setToken(res.token)
        if (res.piiWarning) {
          setPii(
            `В сценарии найдены персональные данные (${res.piiWarning.count}). По ссылке они будут видны всем.`,
          )
        }
      }
    })
  }
  function disable() {
    start(async () => {
      const res = await disableShareLinkAction(scenarioId)
      if (res.ok) {
        setToken(null)
        setCopied(false)
      }
    })
  }
  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!token ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={enable}>
          {pending ? '…' : 'Поделиться ссылкой'}
        </Button>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="h-9 w-64 rounded-md px-2 text-sm text-neutral-700 ring-1 ring-neutral-200"
              aria-label="Публичная ссылка на сценарий"
            />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={disable}>
              Отозвать
            </Button>
          </div>
          {pii && <span className="text-xs text-warm-600">{pii}</span>}
        </div>
      )}
    </div>
  )
}
