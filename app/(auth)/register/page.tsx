'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useActionState } from 'react'
import { type RegisterState, registerAction } from './actions'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerAction, null)

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {state?.error && <p className="text-sm text-error">{state.error}</p>}
            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Регистрируем…' : 'Создать аккаунт'}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              Уже есть аккаунт?{' '}
              <Link className="text-brand-600 hover:underline" href="/login">
                Войти
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
