import { isWhitelisted, windowStartFor } from './window'

export type RateStore = {
  cleanup: (subject: string, olderThan: Date) => Promise<void>
  current: (key: string, subject: string, windowStart: Date) => Promise<number>
  increment: (key: string, subject: string, windowStart: Date) => Promise<void>
}

export type RateCheck = {
  key: string
  subject: string
  limit: number
  windowMs: number
  email?: string | null
  bypass?: boolean
}

export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number }

export async function checkRateLimit(
  check: RateCheck,
  deps: { store?: RateStore; now?: Date; demoEmails?: string } = {},
): Promise<RateResult> {
  if (check.bypass) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
  }
  const demoEmails = deps.demoEmails ?? process.env.DEMO_USER_EMAILS
  if (isWhitelisted(check.email, demoEmails)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
  }
  const now = deps.now ?? new Date()
  let store = deps.store
  if (!store) {
    store = (await import('./store')).dbStore
  }
  const ws = windowStartFor(now, check.windowMs)
  await store.cleanup(check.subject, new Date(now.getTime() - 86_400_000))
  const used = await store.current(check.key, check.subject, ws)
  if (used >= check.limit) {
    const retryAfterSec = Math.ceil((ws.getTime() + check.windowMs - now.getTime()) / 1000)
    return { allowed: false, remaining: 0, retryAfterSec }
  }
  await store.increment(check.key, check.subject, ws)
  return { allowed: true, remaining: check.limit - used - 1, retryAfterSec: 0 }
}
