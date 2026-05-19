'use server'

import { signIn } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { eq } from 'drizzle-orm'
import { AuthError } from 'next-auth'
import { z } from 'zod'

const schema = z.object({
  email: z
    .string()
    .email('Введите корректный email')
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  name: z.string().min(1, 'Имя обязательно').max(80),
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
})

export type RegisterState = { error?: string } | null

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
  }

  const { email, name, password } = parsed.data
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing) return { error: 'Пользователь с таким email уже зарегистрирован' }

  const passwordHash = await hashPassword(password)
  await db.insert(users).values({ email, name, passwordHash })

  // авто-вход после регистрации; signIn выбрасывает NEXT_REDIRECT на успехе
  try {
    await signIn('credentials', { email, password, redirectTo: '/app' })
  } catch (err) {
    // пропускаем редирект-сигнал Next.js
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest?: unknown }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    if (err instanceof AuthError) {
      return { error: 'Аккаунт создан, но автоматический вход не удался. Войдите вручную.' }
    }
    throw err
  }
  return null
}
