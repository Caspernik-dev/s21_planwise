'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { loginAction, type LoginState } from './actions'

function LoginForm() {
  const params = useSearchParams()
  const rawNext = params.get('next')
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app'
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      {state?.error && (
        <p className="text-sm text-error">{state.error}</p>
      )}
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Входим…' : 'Войти'}
      </Button>
      <p className="text-center text-sm text-neutral-600">
        Нет аккаунта? <Link className="text-brand-600 hover:underline" href="/register">Регистрация</Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader>
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}
