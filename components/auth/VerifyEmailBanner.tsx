'use client'

import { resendVerificationAction } from '@/app/(auth)/actions/resend-verify'
import { useState, useTransition } from 'react'

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="bg-warm-50 border-b border-warm-200 px-6 py-3 text-sm">
      <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-3 justify-between">
        <span className="text-warm-900">
          Подтвердите почту — мы отправили письмо на <b>{email}</b>.
        </span>
        <div className="flex items-center gap-3">
          {msg && <span className={msg.ok ? 'text-brand-700' : 'text-warm-800'}>{msg.text}</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMsg(null)
              startTransition(async () => {
                const r = await resendVerificationAction()
                setMsg(
                  r.ok
                    ? { ok: true, text: 'Письмо отправлено.' }
                    : { ok: false, text: r.error ?? 'Ошибка.' },
                )
              })
            }}
            className="px-3 py-1.5 rounded-lg bg-warm-700 text-white hover:bg-warm-800 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Отправляем…' : 'Отправить ещё раз'}
          </button>
        </div>
      </div>
    </div>
  )
}
