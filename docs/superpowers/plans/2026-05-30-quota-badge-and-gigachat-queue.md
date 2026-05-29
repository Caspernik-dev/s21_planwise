# Бейдж дневной квоты + очередь к GigaChat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** показать пользователю остаток дневной квоты генераций (бейдж в навбаре) и поставить параллельные обращения к GigaChat в честную FIFO-очередь с UI-индикатором позиции.

**Architecture:** часть А — read-only хелпер `getDailyGenerationUsage` поверх существующей `rate_buckets` + админ-байпас через новый флаг `bypass` в `checkRateLimit` + server-компонент `QuotaBadge` в навбаре. Часть Б — новый модуль `lib/gigachat/concurrency.ts` (in-memory семафор + FIFO + таймаут + overflow), обёрнутый вокруг всех вызовов в `client.ts` и `embeddings.ts`; SSE-генератор `streamScenario` эмитит новое событие `queued` с позицией, UI `GenerationStream` рендерит «Вы N-й в очереди».

**Tech Stack:** Next.js 15 (server-components), TypeScript, Drizzle (только чтение `rate_buckets`), Vitest, Tailwind tokens из `tailwind.config.ts` (brand/neutral/warm/accent), нативный SSE (через ReadableStream).

**Spec:** `docs/superpowers/specs/2026-05-30-quota-badge-and-gigachat-queue-design.md`.

---

## Files Map

| Файл | Создать/Изменить | Ответственность |
| --- | --- | --- |
| `lib/ratelimit/index.ts` | Modify | Добавить `bypass?: boolean` в `RateCheck`, ранний return при `bypass===true` |
| `tests/lib/ratelimit/check.test.ts` | Modify | Добавить кейс bypass=true (создать файл, если нет) |
| `lib/ratelimit/usage.ts` | **Create** | `getDailyGenerationUsage(userId, email, role)` — чистое чтение |
| `tests/lib/ratelimit/usage.test.ts` | **Create** | TDD для usage-хелпера |
| `components/nav/QuotaBadge.tsx` | **Create** | Server-компонент бейджа |
| `components/nav/AppNavbar.tsx` | Modify | Принимать и рендерить `<QuotaBadge>` |
| `app/app/layout.tsx` | Modify | Считать `usage`, прокинуть в навбар |
| `app/api/generate/stream/route.ts` | Modify | `bypass: session.user.role==='admin'` |
| `lib/gigachat/concurrency.ts` | **Create** | Семафор + FIFO + таймаут + overflow + AbortSignal |
| `tests/lib/gigachat/concurrency.test.ts` | **Create** | TDD c `vi.useFakeTimers()` |
| `lib/gigachat/client.ts` | Modify | Обернуть `chatCompletion` и `chatCompletionStream` в `withGigaChatSlot` |
| `lib/gigachat/embeddings.ts` | Modify | Обернуть `embedBatch` в `withGigaChatSlot` |
| `lib/scenario/stream.ts` | Modify | Пробросить `onQueued` в первый GigaChat-вызов; эмит `{type:'queued', position}`; маппинг ошибок очереди → `error` с `code` |
| `components/generation/GenerationStream.tsx` | Modify | Обработка `queued` + кодов `queue_overflow`/`queue_timeout` |
| `.env.example` | Modify | 3 новые переменные |
| `lib/changelog.ts` | Modify | Запись новой версии |

**Миграций нет.**

---

## Task 1 — `checkRateLimit` admin/whitelist bypass-флаг

**Files:**
- Modify: `lib/ratelimit/index.ts`
- Test: `tests/lib/ratelimit/check.test.ts` (создать, если нет — проверь сначала; используется `vitest`)

- [ ] **Step 1: Проверь существование теста**

Run: `ls tests/lib/ratelimit/`
Ожидание: возможно файл уже есть; если нет — создаём в Step 2.

- [ ] **Step 2: Написать падающий тест на `bypass:true`**

Добавь (или создай файл) такой кейс в `tests/lib/ratelimit/check.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { checkRateLimit, type RateStore } from '@/lib/ratelimit'

describe('checkRateLimit bypass', () => {
  it('bypass=true → allowed, remaining=Infinity, store не вызывается', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 999),
      increment: vi.fn(async () => {}),
    }
    const res = await checkRateLimit(
      { key: 'generate', subject: 'u1', limit: 10, windowMs: 86_400_000, bypass: true },
      { store, now: new Date('2026-05-30T12:00:00Z') },
    )
    expect(res.allowed).toBe(true)
    expect(res.remaining).toBe(Number.POSITIVE_INFINITY)
    expect(res.retryAfterSec).toBe(0)
    expect(store.cleanup).not.toHaveBeenCalled()
    expect(store.current).not.toHaveBeenCalled()
    expect(store.increment).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Прогнать тест, убедиться, что красный**

Run: `pnpm vitest run tests/lib/ratelimit/check.test.ts`
Expected: FAIL (`bypass` не распознан или нет ранней ветки).

- [ ] **Step 4: Имплементация в `lib/ratelimit/index.ts`**

В `RateCheck` добавь поле `bypass?: boolean`. В начале `checkRateLimit` (перед существующей проверкой whitelist) добавь:

```ts
if (check.bypass) {
  return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
}
```

Полностью обновлённая сигнатура `RateCheck`:

```ts
export type RateCheck = {
  key: string
  subject: string
  limit: number
  windowMs: number
  email?: string | null
  bypass?: boolean
}
```

- [ ] **Step 5: Зелёный тест + регрессия**

Run: `pnpm vitest run tests/lib/ratelimit/`
Expected: PASS все, включая новый кейс.

- [ ] **Step 6: Коммит**

```bash
git add lib/ratelimit/index.ts tests/lib/ratelimit/check.test.ts
git commit -m "feat(ratelimit): bypass-флаг для админов в checkRateLimit"
```

---

## Task 2 — `getDailyGenerationUsage` (TDD)

**Files:**
- Create: `lib/ratelimit/usage.ts`
- Test: `tests/lib/ratelimit/usage.test.ts`

- [ ] **Step 1: Падающий тест**

`tests/lib/ratelimit/usage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { getDailyGenerationUsage } from '@/lib/ratelimit/usage'
import type { RateStore } from '@/lib/ratelimit'

const emptyStore: RateStore = {
  cleanup: vi.fn(async () => {}),
  current: vi.fn(async () => 0),
  increment: vi.fn(async () => {}),
}

const now = new Date('2026-05-30T15:30:00Z')

describe('getDailyGenerationUsage', () => {
  it('admin → unlimited', async () => {
    const res = await getDailyGenerationUsage('u1', 'a@x.ru', 'admin', {
      store: emptyStore, now, limit: 10,
    })
    expect(res).toEqual({ unlimited: true })
  })

  it('whitelist email → unlimited', async () => {
    const res = await getDailyGenerationUsage('u1', 'demo@kc.local', 'user', {
      store: emptyStore, now, limit: 10, demoEmails: 'demo@kc.local',
    })
    expect(res).toEqual({ unlimited: true })
  })

  it('нет записи → used=0, remaining=limit', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 0),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res).toEqual({
      unlimited: false,
      used: 0,
      limit: 10,
      remaining: 10,
      resetAt: new Date('2026-05-31T00:00:00Z'),
    })
  })

  it('used=7 → remaining=3', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 7),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res.unlimited).toBe(false)
    if (!res.unlimited) {
      expect(res.used).toBe(7)
      expect(res.remaining).toBe(3)
    }
  })

  it('used > limit → remaining=0 (не отрицательное)', async () => {
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current: vi.fn(async () => 99),
      increment: vi.fn(async () => {}),
    }
    const res = await getDailyGenerationUsage('u1', 'x@x.ru', 'user', {
      store, now, limit: 10,
    })
    expect(res.unlimited).toBe(false)
    if (!res.unlimited) expect(res.remaining).toBe(0)
  })

  it('читает по ключу "generate" (как в роуте)', async () => {
    const current = vi.fn(async () => 2)
    const store: RateStore = {
      cleanup: vi.fn(async () => {}),
      current,
      increment: vi.fn(async () => {}),
    }
    await getDailyGenerationUsage('u1', 'x@x.ru', 'user', { store, now, limit: 10 })
    expect(current).toHaveBeenCalledWith('generate', 'u1', new Date('2026-05-30T00:00:00Z'))
  })
})
```

- [ ] **Step 2: Прогнать — красный**

Run: `pnpm vitest run tests/lib/ratelimit/usage.test.ts`
Expected: FAIL (модуля нет).

- [ ] **Step 3: Реализация `lib/ratelimit/usage.ts`**

```ts
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
```

- [ ] **Step 4: Зелёный**

Run: `pnpm vitest run tests/lib/ratelimit/usage.test.ts`
Expected: PASS все 6.

- [ ] **Step 5: Коммит**

```bash
git add lib/ratelimit/usage.ts tests/lib/ratelimit/usage.test.ts
git commit -m "feat(ratelimit): getDailyGenerationUsage для бейджа квоты"
```

---

## Task 3 — Компонент `QuotaBadge`

**Files:**
- Create: `components/nav/QuotaBadge.tsx`

(Юнит-тест не пишем — чистая разметка по props; покрытие будет через визуальный UAT.)

- [ ] **Step 1: Реализация `components/nav/QuotaBadge.tsx`**

```tsx
import type { DailyUsage } from '@/lib/ratelimit/usage'

export function QuotaBadge({ usage }: { usage: DailyUsage }) {
  if (usage.unlimited) {
    return (
      <span
        title="Без лимита генераций"
        className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-800"
        aria-label="Без лимита генераций"
      >
        ∞
      </span>
    )
  }
  const { used, limit, remaining, resetAt } = usage
  const tone =
    remaining === 0
      ? 'bg-red-100 text-red-700'
      : remaining <= 3
        ? 'bg-warm-100 text-warm-800'
        : 'bg-neutral-100 text-neutral-700'
  const resetHm = resetAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const title = `Осталось ${remaining} из ${limit} генераций на сегодня. Сброс в ${resetHm}`
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {used}/{limit}
    </span>
  )
}
```

- [ ] **Step 2: Tsc-проверка**

Run: `pnpm exec tsc --noEmit`
Expected: 0 ошибок (если есть — поправь, типы из Task 2 должны импортироваться).

- [ ] **Step 3: Коммит**

```bash
git add components/nav/QuotaBadge.tsx
git commit -m "feat(nav): компонент QuotaBadge с цветовыми состояниями"
```

---

## Task 4 — Прокинуть бейдж в навбар + admin-байпас в роуте генерации

**Files:**
- Modify: `app/app/layout.tsx`
- Modify: `components/nav/AppNavbar.tsx`
- Modify: `app/api/generate/stream/route.ts`

- [ ] **Step 1: Расширить `AppNavbar` props и рендер**

Изменения в `components/nav/AppNavbar.tsx`:

1. Импорт сверху файла: добавь
   ```ts
   import type { DailyUsage } from '@/lib/ratelimit/usage'
   import { QuotaBadge } from './QuotaBadge'
   ```
2. Сигнатура:
   ```ts
   export function AppNavbar({
     userName,
     userEmail,
     role,
     usage,
   }: {
     userName?: string | null
     userEmail: string
     role?: string
     usage: DailyUsage
   }) {
   ```
3. В правом блоке (`<div className="flex items-center gap-3">`) ВСТАВЬ `<QuotaBadge usage={usage} />` ПЕРЕД `<span>{userName ?? userEmail}</span>`:
   ```tsx
   <div className="flex items-center gap-3">
     <QuotaBadge usage={usage} />
     <span className="text-sm text-neutral-600">{userName ?? userEmail}</span>
     <form action="/app/logout" method="post">
       <Button type="submit" variant="outline" size="sm">
         Выйти
       </Button>
     </form>
   </div>
   ```

- [ ] **Step 2: Считать usage в layout**

Замени `app/app/layout.tsx` целиком на:

```tsx
import { auth } from '@/auth'
import { AppNavbar } from '@/components/nav/AppNavbar'
import { getDailyGenerationUsage } from '@/lib/ratelimit/usage'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const usage = await getDailyGenerationUsage(
    session.user.id as string,
    session.user.email,
    session.user.role,
  )

  return (
    <div className="min-h-screen">
      <AppNavbar
        userName={session.user.name}
        userEmail={session.user.email ?? ''}
        role={session.user.role}
        usage={usage}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: admin-байпас в роуте генерации**

В `app/api/generate/stream/route.ts` в вызове `checkRateLimit` добавь поле `bypass`:

```ts
const rl = await checkRateLimit({
  key: 'generate',
  subject: userId,
  email: session.user.email,
  bypass: session.user.role === 'admin',
  limit: Number(process.env.MAX_GENERATIONS_PER_DAY ?? '10'),
  windowMs: 86_400_000,
})
```

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: 0 ошибок, билд успешен.

- [ ] **Step 5: Коммит**

```bash
git add app/app/layout.tsx components/nav/AppNavbar.tsx app/api/generate/stream/route.ts
git commit -m "feat(nav): бейдж квоты в навбаре + admin-байпас лимита генераций"
```

---

## Task 5 — Модуль `lib/gigachat/concurrency.ts` (TDD)

**Files:**
- Create: `lib/gigachat/concurrency.ts`
- Test: `tests/lib/gigachat/concurrency.test.ts`

- [ ] **Step 1: Падающие тесты**

`tests/lib/gigachat/concurrency.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetForTests,
  QueueOverflowError,
  QueueTimeoutError,
  withGigaChatSlot,
} from '@/lib/gigachat/concurrency'

beforeEach(() => {
  vi.useFakeTimers()
  process.env.GIGACHAT_MAX_CONCURRENCY = '1'
  process.env.GIGACHAT_QUEUE_MAX = '10'
  process.env.GIGACHAT_QUEUE_TIMEOUT_MS = '300000'
  __resetForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('withGigaChatSlot', () => {
  it('N=1: первый идёт сразу, второй ждёт, onQueued(1) вызван', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const order: string[] = []
    const onQueued2 = vi.fn()

    const p1 = withGigaChatSlot(async () => {
      order.push('1-start')
      await d1.promise
      order.push('1-end')
    })
    const p2 = withGigaChatSlot(
      async () => {
        order.push('2-start')
        await d2.promise
      },
      { onQueued: onQueued2 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['1-start'])
    expect(onQueued2).toHaveBeenCalledWith(1)

    d1.resolve()
    await p1
    await Promise.resolve()
    expect(order).toEqual(['1-start', '1-end', '2-start'])

    d2.resolve()
    await p2
  })

  it('сдвиг очереди: при освобождении третий получает onQueued(1)', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const onQ2 = vi.fn()
    const onQ3 = vi.fn()

    const p1 = withGigaChatSlot(() => d1.promise)
    const p2 = withGigaChatSlot(() => d2.promise, { onQueued: onQ2 })
    const p3 = withGigaChatSlot(() => Promise.resolve(), { onQueued: onQ3 })

    await Promise.resolve()
    expect(onQ2).toHaveBeenCalledWith(1)
    expect(onQ3).toHaveBeenCalledWith(2)

    d1.resolve()
    await p1
    await Promise.resolve()
    await Promise.resolve()
    expect(onQ3).toHaveBeenLastCalledWith(1)

    d2.resolve()
    await p2
    await p3
  })

  it('QueueOverflowError при превышении длины очереди', async () => {
    process.env.GIGACHAT_QUEUE_MAX = '2'
    __resetForTests()
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const p2 = withGigaChatSlot(() => Promise.resolve())
    const p3 = withGigaChatSlot(() => Promise.resolve())
    await expect(withGigaChatSlot(() => Promise.resolve())).rejects.toBeInstanceOf(
      QueueOverflowError,
    )
    d1.resolve()
    await Promise.all([p1, p2, p3])
  })

  it('QueueTimeoutError по истечении GIGACHAT_QUEUE_TIMEOUT_MS', async () => {
    process.env.GIGACHAT_QUEUE_TIMEOUT_MS = '1000'
    __resetForTests()
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const fn2 = vi.fn(async () => 'ok')
    const p2 = withGigaChatSlot(fn2)

    vi.advanceTimersByTime(1000)
    await expect(p2).rejects.toBeInstanceOf(QueueTimeoutError)
    expect(fn2).not.toHaveBeenCalled()

    d1.resolve()
    await p1
  })

  it('AbortSignal до получения слота: запрос снят, fn не вызывается', async () => {
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const ctrl = new AbortController()
    const fn2 = vi.fn(async () => 'ok')
    const p2 = withGigaChatSlot(fn2, { signal: ctrl.signal })

    await Promise.resolve()
    ctrl.abort(new Error('cancelled'))
    await expect(p2).rejects.toThrow('cancelled')
    expect(fn2).not.toHaveBeenCalled()

    d1.resolve()
    await p1
  })

  it('N=2: два запроса параллельно, третий ждёт', async () => {
    process.env.GIGACHAT_MAX_CONCURRENCY = '2'
    __resetForTests()
    const d1 = deferred()
    const d2 = deferred()
    const onQ3 = vi.fn()
    const started: string[] = []

    const p1 = withGigaChatSlot(async () => {
      started.push('1')
      await d1.promise
    })
    const p2 = withGigaChatSlot(async () => {
      started.push('2')
      await d2.promise
    })
    const p3 = withGigaChatSlot(
      async () => {
        started.push('3')
      },
      { onQueued: onQ3 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['1', '2'])
    expect(onQ3).toHaveBeenCalledWith(1)

    d1.resolve()
    await p1
    d2.resolve()
    await p2
    await p3
  })
})
```

- [ ] **Step 2: Прогон — красный**

Run: `pnpm vitest run tests/lib/gigachat/concurrency.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализация `lib/gigachat/concurrency.ts`**

```ts
export class QueueOverflowError extends Error {
  constructor() {
    super('GigaChat queue overflow')
    this.name = 'QueueOverflowError'
  }
}
export class QueueTimeoutError extends Error {
  constructor() {
    super('GigaChat queue timeout')
    this.name = 'QueueTimeoutError'
  }
}

export type QueueOptions = {
  onQueued?: (position: number) => void
  signal?: AbortSignal
}

type Waiter = {
  onQueued?: (position: number) => void
  resolveSlot: () => void
  rejectWaiter: (err: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
  onAbort: (() => void) | null
  signal?: AbortSignal
  acquired: boolean
}

let active = 0
const queue: Waiter[] = []

function cfg() {
  return {
    max: Math.max(1, Number(process.env.GIGACHAT_MAX_CONCURRENCY ?? '1')),
    queueMax: Math.max(0, Number(process.env.GIGACHAT_QUEUE_MAX ?? '10')),
    timeoutMs: Math.max(1000, Number(process.env.GIGACHAT_QUEUE_TIMEOUT_MS ?? '300000')),
  }
}

function notifyPositions() {
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i]
    if (!w.acquired && w.onQueued) w.onQueued(i + 1)
  }
}

function release() {
  active = Math.max(0, active - 1)
  drain()
}

function drain() {
  const { max } = cfg()
  while (active < max && queue.length > 0) {
    const w = queue.shift()
    if (!w) break
    if (w.acquired) continue
    w.acquired = true
    if (w.timer) clearTimeout(w.timer)
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
    active++
    w.resolveSlot()
  }
  notifyPositions()
}

function removeFromQueue(w: Waiter) {
  const idx = queue.indexOf(w)
  if (idx >= 0) queue.splice(idx, 1)
}

export async function withGigaChatSlot<T>(
  fn: () => Promise<T>,
  opts: QueueOptions = {},
): Promise<T> {
  const { max, queueMax, timeoutMs } = cfg()

  if (active < max) {
    active++
    try {
      return await fn()
    } finally {
      release()
    }
  }

  if (queue.length >= queueMax) {
    throw new QueueOverflowError()
  }

  const slotReady = new Promise<void>((resolveSlot, rejectWaiter) => {
    const w: Waiter = {
      onQueued: opts.onQueued,
      resolveSlot,
      rejectWaiter,
      timer: null,
      onAbort: null,
      signal: opts.signal,
      acquired: false,
    }
    w.timer = setTimeout(() => {
      removeFromQueue(w)
      if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
      rejectWaiter(new QueueTimeoutError())
      notifyPositions()
    }, timeoutMs)
    if (opts.signal) {
      const onAbort = () => {
        if (w.acquired) return
        removeFromQueue(w)
        if (w.timer) clearTimeout(w.timer)
        rejectWaiter(opts.signal?.reason ?? new Error('aborted'))
        notifyPositions()
      }
      w.onAbort = onAbort
      if (opts.signal.aborted) {
        onAbort()
        return
      }
      opts.signal.addEventListener('abort', onAbort)
    }
    queue.push(w)
    if (opts.onQueued) opts.onQueued(queue.length)
  })

  await slotReady

  try {
    return await fn()
  } finally {
    release()
  }
}

export function __resetForTests() {
  active = 0
  for (const w of queue) {
    if (w.timer) clearTimeout(w.timer)
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
  }
  queue.length = 0
}
```

- [ ] **Step 4: Прогон — зелёный**

Run: `pnpm vitest run tests/lib/gigachat/concurrency.test.ts`
Expected: PASS все 6.

- [ ] **Step 5: Полный прогон**

Run: `pnpm test`
Expected: все зелёные (никаких регрессий — модуль ещё ни к чему не подключён).

- [ ] **Step 6: Коммит**

```bash
git add lib/gigachat/concurrency.ts tests/lib/gigachat/concurrency.test.ts
git commit -m "feat(gigachat): семафор + FIFO-очередь с таймаутом и overflow"
```

---

## Task 6 — Обернуть `client.ts` (chat + stream) в семафор

**Files:**
- Modify: `lib/gigachat/client.ts`

Внимание: для `chatCompletionStream` слот должен удерживаться **весь стрим**, иначе следующий запрос пойдёт параллельно текущему ридеру и упрётся в 429 GigaChat.

- [ ] **Step 1: Изменить `chatCompletion`**

Добавь импорт сверху:

```ts
import { withGigaChatSlot } from './concurrency'
```

Расширь сигнатуру:

```ts
export type ChatOptions = {
  temperature?: number
  maxTokens?: number
  onQueued?: (position: number) => void
  signal?: AbortSignal
}
```

И оберни тело `chatCompletion`:

```ts
export async function chatCompletion(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  return withGigaChatSlot(
    async () => {
      const cfg = getGigaConfig()
      ensureInsecureTls(cfg.insecureTls)
      const token = await getAccessToken()
      // ... остальное тело без изменений (fetch, проверка !res.ok, parse, return) ...
    },
    { onQueued: opts.onQueued, signal: opts.signal },
  )
}
```

(Сохрани существующее тело fetch и парсинга внутри callback.)

- [ ] **Step 2: Изменить `chatCompletionStream` (слот удерживается на весь стрим)**

Перепиши генератор так, чтобы fetch и весь дренаж reader'а шли внутри `withGigaChatSlot`. Реализуй через двойную обёртку: внешний async-генератор зовёт внутренний, дренирующий ридер в очередь, и при этом `withGigaChatSlot` ждёт пока генератор завершится.

Замени `chatCompletionStream` на:

```ts
export async function* chatCompletionStream(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  // буферный канал — внешний генератор тянет токены, внутренний пушит
  const chunks: string[] = []
  let done = false
  let errorVal: unknown = null
  let notify: (() => void) | null = null
  const wait = () =>
    new Promise<void>((res) => {
      if (chunks.length > 0 || done) res()
      else notify = res
    })

  const slotPromise = withGigaChatSlot(
    async () => {
      const cfg = getGigaConfig()
      ensureInsecureTls(cfg.insecureTls)
      const token = await getAccessToken()
      const res = await fetch(`${cfg.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 2400,
          stream: true,
        }),
      })
      if (!res.ok) {
        const text = typeof res.text === 'function' ? await res.text() : ''
        throw new Error(`GigaChat stream failed: ${res.status} ${text}`)
      }
      if (!res.body) throw new Error('GigaChat stream: пустое тело ответа')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done: rdone } = await reader.read()
        if (rdone) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSSEBuffer(buffer)
        buffer = rest
        for (const ev of events) {
          if (ev === '[DONE]') return
          try {
            const obj = JSON.parse(ev) as ChatCompletionResponse
            const delta = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content
            if (typeof delta === 'string' && delta.length > 0) {
              chunks.push(delta)
              if (notify) {
                notify()
                notify = null
              }
            }
          } catch {
            // игнор не-JSON SSE кадров
          }
        }
      }
    },
    { onQueued: opts.onQueued, signal: opts.signal },
  )
    .catch((e) => {
      errorVal = e
    })
    .finally(() => {
      done = true
      if (notify) {
        notify()
        notify = null
      }
    })

  while (true) {
    if (chunks.length === 0 && !done) await wait()
    while (chunks.length > 0) yield chunks.shift() as string
    if (done) break
  }
  await slotPromise
  if (errorVal) throw errorVal
}
```

(Проверь, какие типы реально объявлены в `./types` — `ChatCompletionResponse.choices[0].delta?.content` может отсутствовать. Если так — расширь тип в `./types` соответствующим optional полем `delta?: { content?: string }`.)

- [ ] **Step 3: Проверь типы стрим-кадров**

Run: `grep -n "delta\|ChatCompletionResponse" lib/gigachat/types.ts`
Если поля `delta` нет — добавь в `Choice` тип:

```ts
delta?: { content?: string }
```

- [ ] **Step 4: Гейты**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: всё зелёное (concurrency-тесты по-прежнему PASS; никаких новых; стрим прежний работает — N=1 по умолчанию, так что один запрос идёт как раньше).

- [ ] **Step 5: Коммит**

```bash
git add lib/gigachat/client.ts lib/gigachat/types.ts
git commit -m "feat(gigachat): оборачиваем chat и chat-stream в семафор слотов"
```

---

## Task 7 — Обернуть `embeddings.ts`

**Files:**
- Modify: `lib/gigachat/embeddings.ts`

- [ ] **Step 1: Обернуть `embedBatch`**

Добавь импорт `import { withGigaChatSlot } from './concurrency'`. Расширь `embed` опциональным параметром `opts?: { onQueued?: (n:number)=>void; signal?: AbortSignal }` и проброс в каждый батч:

```ts
export async function embed(
  texts: string[],
  opts: { onQueued?: (position: number) => void; signal?: AbortSignal } = {},
): Promise<number[][]> {
  if (texts.length === 0) return []
  const size = batchSize()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size)
    const res = await withGigaChatSlot(() => embedBatch(batch), opts)
    out.push(...res)
  }
  return out
}
```

(`embedBatch` оставляем как есть — без обёртки. Обёртка снаружи.)

- [ ] **Step 2: Гейты**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: всё зелёное. Существующие тесты embeddings проходят: они мокают `fetch`, а семафор с N=1 пускает первый запрос сразу.

- [ ] **Step 3: Коммит**

```bash
git add lib/gigachat/embeddings.ts
git commit -m "feat(gigachat): оборачиваем embed в семафор слотов"
```

---

## Task 8 — SSE-событие `queued` в `streamScenario` и маппинг ошибок очереди

**Files:**
- Modify: `lib/scenario/stream.ts`
- Modify: `app/api/generate/stream/route.ts`

Подход: прокидываем `onQueued` ТОЛЬКО в первый GigaChat-вызов внутри `streamScenario` (это `embed` для RAG или, если RAG отключён — первый skeleton-стрим). Этого достаточно, чтобы пользователь увидел, что висит в очереди. После старта стрима последующие вызовы (внутри per-block цикла) идут под семафор молча — пользователь уже видит прогресс блоков.

- [ ] **Step 1: Расширить `StreamEvent`**

В `lib/scenario/stream.ts` тип `StreamEvent`:

```ts
export type StreamEvent =
  | { type: 'queued'; position: number }
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string; code?: 'queue_overflow' | 'queue_timeout' }
```

- [ ] **Step 2: Прокинуть `onQueued` в первый вызов и обработать ошибки очереди**

Найди в `streamScenario` место, где впервые вызывается GigaChat (это либо `deps.embed(...)` для RAG-эмбеддинга запроса, либо `deps.chatStream(...)` для skeleton — сначала идёт RAG-блок, посмотри по коду).

Перед этим первым вызовом:

```ts
import {
  QueueOverflowError,
  QueueTimeoutError,
} from '@/lib/gigachat/concurrency'
```

Заведи буфер для отложенного эмита позиций. Поскольку `streamScenario` уже является async-генератором, простейший способ — собрать pending-позиции в массив и yield-нуть их до старта вызова, но onQueued асинхронен. Корректное решение: использовать "канал" по аналогии с Task 6.

В начало `streamScenario` (до RAG/embed) добавь:

```ts
const queuedPositions: number[] = []
let onQueuedSeen = false
const onQueued = (position: number) => {
  queuedPositions.push(position)
  onQueuedSeen = true
}
```

Передай `{ onQueued }` в первый вызов (`deps.embed(...)` и/или `deps.chatStream(...)` — в обоих, на случай если RAG-блок отключён конфигом).

ПОСЛЕ возврата из первого вызова (но до `yield { type:'phase', phase:'skeleton' }`) выгрузи накопленные позиции:

```ts
while (queuedPositions.length > 0) {
  const pos = queuedPositions.shift() as number
  yield { type: 'queued', position: pos }
}
```

И оберни весь `try`-блок `streamScenario` так, чтобы поймать `QueueOverflowError`/`QueueTimeoutError` отдельно:

```ts
} catch (e) {
  if (e instanceof QueueOverflowError) {
    yield {
      type: 'error',
      code: 'queue_overflow',
      message: 'Сервис временно перегружен, попробуйте через минуту.',
    }
    return
  }
  if (e instanceof QueueTimeoutError) {
    yield {
      type: 'error',
      code: 'queue_timeout',
      message: 'Очередь не освободилась за 5 минут. Попробуйте позже.',
    }
    return
  }
  yield { type: 'error', message: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
}
```

**Примечание для имплементера:** в текущем `stream.ts` строки 257 уже есть такой `catch`. Замени существующий `yield { type: 'error', message: ... }` на блок выше (с проверкой instanceof перед общим случаем).

- [ ] **Step 3: Проверить, что `deps.embed`/`deps.chatStream` принимают `opts`**

Посмотри сигнатуры `deps` в `streamScenario`. После Task 6/7:
- `chatCompletionStream(messages, opts)` принимает `onQueued`.
- `embed(texts, opts)` принимает `onQueued`.

Если `deps`-интерфейс в `stream.ts` фиксирует более узкие сигнатуры — расширь их, чтобы пробрасывать opts:

```ts
type GenerateDeps = {
  embed?: (texts: string[], opts?: { onQueued?: (n:number)=>void }) => Promise<number[][]>
  chatStream?: (
    messages: GigaMessage[],
    opts?: { temperature?: number; maxTokens?: number; onQueued?: (n:number)=>void },
  ) => AsyncGenerator<string, void, unknown>
  // ... остальное ...
}
```

(Если тип называется иначе — оставь имя как в коде. Цель — чтобы вызов с `{ onQueued }` тайп-чекнулся.)

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 ошибок типов. Тесты `lib/scenario/stream` (если есть) проходят — `onQueued` опционален.

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/stream.ts
git commit -m "feat(stream): SSE-событие queued и маппинг ошибок очереди"
```

---

## Task 9 — UI обработка `queued` + ошибок очереди

**Files:**
- Modify: `components/generation/GenerationStream.tsx`

- [ ] **Step 1: Расширить тип `StreamEvent` и state**

В `components/generation/GenerationStream.tsx` найди локальный тип `StreamEvent` (строка ~11). Расширь:

```ts
type StreamEvent =
  | { type: 'queued'; position: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'skeleton'; data: { title?: string; stages?: Array<{ title?: string }> } }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string; code?: 'queue_overflow' | 'queue_timeout' }
```

Добавь state для очереди:

```ts
const [queuePosition, setQueuePosition] = useState<number | null>(null)
```

- [ ] **Step 2: Обработка событий**

В редьюсере SSE добавь:

```ts
if (ev.type === 'queued') {
  setQueuePosition(ev.position)
  return
}
if (ev.type === 'phase') {
  setQueuePosition(null) // выходим из режима очереди
  setPhase(ev.phase)
  return
}
```

(Адаптируй под существующую структуру switch/if-цепочки.)

Для `error` уже есть обработка. Сообщение из `ev.message` уже корректное для overflow/timeout (мы его задали в Task 8). Если хочется — стилизуй жёлтым для `queue_overflow`/`queue_timeout`:

```ts
if (ev.type === 'error') {
  setError({ message: ev.message, soft: ev.code !== undefined })
  return
}
```

(Если редьюсер ожидает `string` — оставь `setError(ev.message)`; визуальное различение опционально.)

- [ ] **Step 3: Рендер блока очереди**

В рендере перед прогресс-баром фаз добавь условный блок:

```tsx
{queuePosition !== null ? (
  <div className="rounded-2xl border border-warm-200 bg-warm-50 p-6 text-center">
    <div className="mb-2 text-2xl font-semibold text-warm-800 animate-pulse">⏳</div>
    <p className="text-sm font-medium text-warm-900">
      Вы {queuePosition}-й в очереди
    </p>
    <p className="mt-1 text-xs text-warm-700">
      Сервис генерирует чужой сценарий — ваш стартует, как только освободится слот.
    </p>
  </div>
) : (
  /* существующий блок прогресс-фаз */
)}
```

(Если в файле прогресс-блок не выделен отдельно — заверни существующий JSX в `:`-ветку условия.)

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: 0 ошибок, билд успешен.

- [ ] **Step 5: Коммит**

```bash
git add components/generation/GenerationStream.tsx
git commit -m "feat(ui): индикатор «вы N-й в очереди» + сообщения об overflow/timeout"
```

---

## Task 10 — env.example, changelog, финальный гейт

**Files:**
- Modify: `.env.example`
- Modify: `lib/changelog.ts`

- [ ] **Step 1: Добавить переменные в `.env.example`**

Добавь в конец секции с переменными GigaChat (если такой секции нет — после блока `GIGACHAT_*`):

```
# Сколько параллельных вызовов к GigaChat разрешено (тариф)
GIGACHAT_MAX_CONCURRENCY=1
# Максимум ожидающих в очереди перед тем, как отказывать 503
GIGACHAT_QUEUE_MAX=10
# Сколько максимум миллисекунд запрос может ждать в очереди
GIGACHAT_QUEUE_TIMEOUT_MS=300000
```

- [ ] **Step 2: Запись в changelog**

В `lib/changelog.ts` добавь НОВЫЙ объект в НАЧАЛО массива `CHANGELOG`. Версия — следующая минорная (новые фичи). Узнай текущую верхнюю версию: `grep -m1 "version:" lib/changelog.ts`. Подними минор на 1 (например `1.8.0` → `1.9.0`).

```ts
{
  version: 'v1.X.0', // ← подставь актуальное значение
  date: '2026-05-30',
  changes: [
    {
      kind: 'feature',
      text: 'Бейдж дневной квоты генераций в навбаре (рядом с email). У админов и whitelisted-аккаунтов — без лимита (∞).',
    },
    {
      kind: 'feature',
      text: 'Параллельные генерации встают в очередь к GigaChat: показываем «Вы N-й в очереди», вместо того чтобы падать.',
    },
  ],
},
```

- [ ] **Step 3: Финальные гейты**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: всё зелёное, билд успешен, роуты `/app/*` и `/api/generate/stream` в выводе билда.

- [ ] **Step 4: Коммит**

```bash
git add .env.example lib/changelog.ts
git commit -m "docs(changelog): бейдж квоты и очередь к GigaChat"
```

---

## Ручной UAT перед мержем

1. **Бейдж — обычный юзер**: логин → бейдж `10/10` нейтральный. Запустить генерацию → после успеха `9/10`. Hover — tooltip «Осталось 9 из 10 генераций. Сброс в 03:00».
2. **Бейдж — границы**: задать `MAX_GENERATIONS_PER_DAY=3` в `.env.local`, запустить 3 раза, на 3-й увидеть `0/3` красный; 4-я попытка → 429 от роута, экран ошибки.
3. **Бейдж — админ**: задать роль `admin` юзеру (`pnpm set:admin <email>`), перезалогиниться → бейдж `∞`. Генерации идут без декремента.
4. **Очередь — две вкладки**: в двух браузерах одновременно нажать «Создать» — одна вкладка показывает «Подбираем методички», вторая «Вы 2-й в очереди». После завершения первой — вторая переключается на прогресс.
5. **Очередь — overflow**: установить `GIGACHAT_QUEUE_MAX=1`, открыть три вкладки и одновременно сабмитить — третья должна получить «Сервис временно перегружен, попробуйте через минуту».

## Гейты до запроса review
- `pnpm test` (все зелёные, новые тесты Tasks 1/2/5 присутствуют).
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- Визуальный smoke на `localhost:3000` (Task 4: бейдж в навбаре виден).

## Риски и грабли (повтор из спеки)
- **Утечка слота в стриме**: реализован канал с `finally` в Task 6 — слот освобождается даже при throw из вызывающего.
- **Свежесть бейджа**: после генерации UI делает `router.push` → layout пере-рендерится. Если делаешь только `router.refresh()` где-то ещё — проверь, что navbar обновляется.
- **Глобальный singleton очереди** — корректен в одном Node-процессе. Прод = один docker-контейнер `app`. При масштабировании понадобится Redis (#33 расширение).
