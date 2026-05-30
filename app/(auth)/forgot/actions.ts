'use server'

import { db } from '@/db'
import { users } from '@/db/schema'
import { invalidateUserTokens, issueToken } from '@/lib/auth/tokens'
import { sendPasswordResetEmail } from '@/lib/email/send'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { z } from 'zod'

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
})

export type ForgotState = { ok?: boolean; error?: string } | null

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'Введите корректный email' }

  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : (h.get('x-real-ip') ?? 'unknown')).trim()
  const limit = Number(process.env.MAX_FORGOT_PER_HOUR ?? '5')
  const rl = await checkRateLimit({
    key: 'forgot',
    subject: ip,
    limit,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return { error: 'Слишком много запросов. Повторите через час.' }
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1)
  if (user) {
    try {
      await invalidateUserTokens(user.id, 'reset')
      const ttl = Number(process.env.RESET_TOKEN_TTL_SEC ?? '3600')
      const { token } = await issueToken(user.id, 'reset', ttl)
      const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
      const proto = h.get('x-forwarded-proto') ?? 'https'
      const baseUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? `${proto}://${host}`
      const url = `${baseUrl}/reset?token=${encodeURIComponent(token)}`
      await sendPasswordResetEmail(user.email, url)
    } catch (err) {
      console.error('[forgot] send failed:', err)
    }
  }
  // generic response — do not leak existence
  return { ok: true }
}
