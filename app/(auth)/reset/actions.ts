'use server'

import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { consumeToken } from '@/lib/auth/tokens'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
  passwordConfirm: z.string(),
})

export type ResetState = { error?: string } | null

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
  if (parsed.data.password !== parsed.data.passwordConfirm) {
    return { error: 'Пароли не совпадают' }
  }

  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : (h.get('x-real-ip') ?? 'unknown')).trim()
  const limit = Number(process.env.MAX_RESET_ATTEMPT_PER_HOUR ?? '10')
  const rl = await checkRateLimit({
    key: 'reset-attempt',
    subject: ip,
    limit,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) return { error: 'Слишком много попыток. Повторите через час.' }

  const consumed = await consumeToken(parsed.data.token, 'reset')
  if (!consumed) return { error: 'Ссылка недействительна или истекла. Запросите новую.' }

  const passwordHash = await hashPassword(parsed.data.password)
  await db
    .update(users)
    .set({
      passwordHash,
      passwordVersion: sql`${users.passwordVersion} + 1`,
      emailVerified: sql`COALESCE(${users.emailVerified}, NOW())`,
    })
    .where(eq(users.id, consumed.userId))

  redirect('/login?reset=1')
}
