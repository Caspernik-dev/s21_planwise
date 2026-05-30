'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState } from 'react'
import { type ResetState, resetPasswordAction } from './actions'

function ResetForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    null,
  )

  if (!token) {
    return (
      <p className="text-warm-800">
        Ссылка без токена.{' '}
        <Link href="/forgot" className="text-brand-700 hover:underline">
          Запросить новую
        </Link>
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="block text-sm font-medium text-neutral-800 mb-1">Новый пароль</span>
        <input
          type="password"
          name="password"
          minLength={8}
          required
          className="w-full px-3 py-2 rounded-lg ring-1 ring-neutral-300 focus:ring-brand-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-neutral-800 mb-1">Повторите пароль</span>
        <input
          type="password"
          name="passwordConfirm"
          minLength={8}
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
        {pending ? 'Сохраняем…' : 'Задать новый пароль'}
      </button>
    </form>
  )
}

export default function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Новый пароль</h1>
        <p className="text-neutral-700 mb-6">Введите новый пароль для своего аккаунта Planwise.</p>
        <Suspense fallback={<p className="text-neutral-500">Загрузка…</p>}>
          <ResetForm />
        </Suspense>
        <p className="text-sm text-neutral-600 mt-6">
          <Link href="/login" className="text-brand-700 hover:underline">
            ← На страницу входа
          </Link>
        </p>
      </div>
    </div>
  )
}
