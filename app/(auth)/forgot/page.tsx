'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { type ForgotState, forgotPasswordAction } from './actions'

export default function ForgotPage() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    null,
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Сброс пароля</h1>
        <p className="text-neutral-700 mb-6">
          Введите email от аккаунта Planwise. Если он зарегистрирован, мы отправим письмо со ссылкой
          для сброса пароля.
        </p>
        {state?.ok ? (
          <div className="rounded-xl bg-brand-50 ring-1 ring-brand-200 p-4 text-brand-900">
            Если email зарегистрирован, мы отправили письмо. Проверьте почту (и папку «Спам»).
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-neutral-800 mb-1">Email</span>
              <input
                type="email"
                name="email"
                required
                className="w-full px-3 py-2 rounded-lg ring-1 ring-neutral-300 focus:ring-brand-500 focus:outline-none"
              />
            </label>
            {state?.error && <p className="text-sm text-warm-800">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              {pending ? 'Отправляем…' : 'Отправить ссылку'}
            </button>
          </form>
        )}
        <p className="text-sm text-neutral-600 mt-6">
          <Link href="/login" className="text-brand-700 hover:underline">
            ← На страницу входа
          </Link>
        </p>
      </div>
    </div>
  )
}
