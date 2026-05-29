import type { RateStore } from './index'
import { isWhitelisted, windowStartFor } from './window'

const DAY_MS = 86_400_000

export type DailyUsage =
  | { unlimited: true }
  | {
      unlimited: false
      used: number
      limit: number
      remaining: number
      resetAt: Date
    }

export type UsageDeps = {
  store?: RateStore
  now?: Date
  limit?: number
  demoEmails?: string
}

export async function getDailyGenerationUsage(
  userId: string,
  email: string | null | undefined,
  role: string | undefined,
  deps: UsageDeps = {},
): Promise<DailyUsage> {
  const demoEmails = deps.demoEmails ?? process.env.DEMO_USER_EMAILS
  if (role === 'admin' || isWhitelisted(email, demoEmails)) {
    return { unlimited: true }
  }
  const limit = deps.limit ?? Number(process.env.MAX_GENERATIONS_PER_DAY ?? '10')
  const now = deps.now ?? new Date()
  let store = deps.store
  if (!store) {
    store = (await import('./store')).dbStore
  }
  const ws = windowStartFor(now, DAY_MS)
  const used = await store.current('generate', userId, ws)
  return {
    unlimited: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: new Date(ws.getTime() + DAY_MS),
  }
}
