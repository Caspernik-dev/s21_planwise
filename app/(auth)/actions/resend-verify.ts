'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { invalidateUserTokens, issueToken } from '@/lib/auth/tokens'
import { sendVerificationEmail } from '@/lib/email/send'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export type ResendResult = { ok: boolean; error?: string }

export async function resendVerificationAction(): Promise<ResendResult> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Не авторизованы' }
  const userId = session.user.id
  const email = session.user.email

  const [row] = await db
    .select({ ev: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (row?.ev) return { ok: true }

  const limit = Number(process.env.MAX_VERIFY_RESEND_PER_HOUR ?? '3')
  const rl = await checkRateLimit({
    key: 'verify-send',
    subject: userId,
    limit,
    windowMs: 60 * 60 * 1000,
    email,
  })
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Слишком много запросов. Повторите через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
    }
  }

  try {
    await invalidateUserTokens(userId, 'verify')
    const ttl = Number(process.env.VERIFY_TOKEN_TTL_SEC ?? '86400')
    const { token } = await issueToken(userId, 'verify', ttl)
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
    const proto = h.get('x-forwarded-proto') ?? 'https'
    const baseUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? `${proto}://${host}`
    const url = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`
    const r = await sendVerificationEmail(email, url)
    if (!r.ok) return { ok: false, error: 'Не удалось отправить письмо. Попробуйте позже.' }
    return { ok: true }
  } catch (err) {
    console.error('[resend-verify] failed:', err)
    return { ok: false, error: 'Внутренняя ошибка. Попробуйте позже.' }
  }
}
