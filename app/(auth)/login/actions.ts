'use server'

import { signIn } from '@/auth'
import { checkRateLimit } from '@/lib/ratelimit'
import { AuthError } from 'next-auth'
import { headers } from 'next/headers'
import { z } from 'zod'

function safeNext(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : ''
  return s.startsWith('/') && !s.startsWith('//') ? s : '/app'
}

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
})

export type LoginState = { error?: string } | null

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'Введите корректные данные' }

  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : (h.get('x-real-ip') ?? 'unknown')).trim()
  const rl = await checkRateLimit({
    key: 'login',
    subject: ip,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rl.allowed) {
    return { error: 'Слишком много попыток входа. Повторите через несколько минут.' }
  }

  const next = safeNext(formData.get('next'))

  try {
    await signIn('credentials', { ...parsed.data, redirectTo: next })
    return null
  } catch (err) {
    if (isNextRedirect(err)) throw err
    if (err instanceof AuthError) return { error: 'Неверный email или пароль' }
    throw err
  }
}
