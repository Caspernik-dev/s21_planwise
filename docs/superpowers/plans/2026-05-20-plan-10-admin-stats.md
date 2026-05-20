# Plan 10 — Admin-панель статистики

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ-страница `/app/admin` с ретроспективной статистикой использования (генерации, контент, пользователи, сообщество, события), доступная только пользователям с `role='admin'`.

**Architecture:** Read-only дашборд поверх существующих таблиц (история уже копится через `created_at`) + новая таблица `events` для эфемерных метрик (экспорт/логин/поиск). Авторизация через новое поле `users.role`, прокинутое в JWT-сессию. Агрегаты — в одном модуле `lib/admin/stats.ts` (намеренное исключение из изоляции `user_id`, защищённое role-гардом). UI — карточки + таблицы + CSS-bar'ы из `design_example`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle, Postgres, Auth.js v5 (JWT), Tailwind, Vitest, Biome, pnpm.

**Гейты (зелёные ПЕРЕД каждым коммитом):** `pnpm test` (baseline 192 pass / 3 skip), `pnpm lint` (exit 0), `pnpm exec tsc --noEmit`, `pnpm build`.

**Конвенции:** один коммит на задачу; TDD для чистой логики (тест сначала); юнит-тесты без живой сети/БД (инъекция стабов); UI русский, сверять с `design_example/`; **никогда `git add -A`** (untracked `design_example/` не коммитить); агрегаты по чужим данным — только в `lib/admin/*` под role-гардом.

Спека: `docs/superpowers/specs/2026-05-20-admin-stats-design.md`.

---

## File Structure

**Создаются:**
- `lib/admin/guard.ts` — `isAdmin(session)` (чистый предикат)
- `lib/admin/format.ts` — `barPercent(value, max)`, `successRate(ok, total)` (чистые)
- `lib/admin/stats.ts` — агрегатные функции (инъекция `db`)
- `lib/events/log.ts` — `logEvent` (best-effort)
- `app/app/admin/page.tsx` — страница (server, role-гард)
- `components/admin/{SectionCard,KpiCard,BarList,StatTable}.tsx`
- `scripts/set-admin.ts`
- `db/migrations/0009_*.sql` (через drizzle-kit generate)
- тесты: `tests/lib/admin/guard.test.ts`, `tests/lib/admin/format.test.ts`, `tests/lib/events/log.test.ts`, `tests/smoke/admin-schema.test.ts`

**Модифицируются:**
- `db/schema.ts` (`users.role`, таблица `events`)
- `auth.ts` (role в authorize/jwt/session + тип; logEvent('login'))
- `app/api/scenarios/[id]/export/route.ts` (logEvent('export'))
- `app/app/library/actions.ts` (logEvent('search'))
- `components/nav/AppNavbar.tsx` (+ ссылка «Админ» для admin), `app/app/layout.tsx` (прокинуть role)
- `package.json` (`set:admin`), `CLAUDE.md` (статус)

---

## Task 1: `users.role` + таблица `events` + миграция

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0009_*.sql` (drizzle-kit generate)
- Test: `tests/smoke/admin-schema.test.ts`

- [ ] **Step 1: Добавить `role` в `users` и таблицу `events` в `db/schema.ts`**

В определении `users` добавить колонку (после `image` или рядом):
```ts
  role: text('role').notNull().default('user'),
```

В конец файла добавить (переиспользуя импортированные `pgTable`/`text`/`jsonb`/`timestamp`/`index`):
```ts
export const events = pgTable(
  'events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // 'export' | 'login' | 'search'
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byTypeCreated: index('events_type_created_idx').on(t.type, t.createdAt),
  }),
)
```
Проверь, что `jsonb` уже импортирован в `db/schema.ts` (используется в `scenarios.content`); если нет — добавить в импорт из `drizzle-orm/pg-core`.

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm exec drizzle-kit generate`
Expected: новый `db/migrations/0009_*.sql` с `ALTER TABLE "users" ADD COLUMN "role" ... DEFAULT 'user'` и `CREATE TABLE "events"` + индекс + FK DO-блок. Прочитай SQL, убедись что нет неожиданных изменений других таблиц (иначе STOP — дрейф схемы).

- [ ] **Step 3: Применить миграцию**

Run: `pnpm db:up && pnpm db:migrate` (если `db:up` падает на docker-сокете, но Postgres уже поднят — продолжай; главное `db:migrate` = "Done.").

- [ ] **Step 4: Smoke-тест**

```ts
// tests/smoke/admin-schema.test.ts
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('admin schema', () => {
  it('таблица events существует', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.events') IS NOT NULL AS ok`)
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
  it('колонка users.role существует', async () => {
    const r = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='role'
      ) AS ok`)
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
})
```
Сверь индексацию результата `db.execute` с `tests/smoke/db.test.ts` (массив строк напрямую) и поправь при необходимости.

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec vitest run tests/smoke/admin-schema.test.ts && pnpm exec tsc --noEmit && pnpm lint`
```bash
git add db/schema.ts db/migrations/ tests/smoke/admin-schema.test.ts
git commit -m "feat(admin): users.role column + events table + migration"
```

---

## Task 2: `role` в Auth.js сессии

**Files:**
- Modify: `auth.ts`

Контекст: текущий `auth.ts` — credentials provider; `authorize` возвращает `{ id, email, name }`; `jwt` callback: `if (user) token.id = user.id`; `session` callback: `if (token.id) session.user.id = token.id`. Тип сессии расширен через `declare module 'next-auth'`.

- [ ] **Step 1: Вернуть `role` из authorize**

В `authorize`, в SELECT уже выбирается весь `user` (`db.select().from(users)...`). Поменяй возврат:
```ts
        return { id: user.id, email: user.email, name: user.name ?? null, role: user.role }
```

- [ ] **Step 2: Прокинуть role в JWT и session + расширить тип**

В `declare module 'next-auth'` добавить `role` в тип user:
```ts
declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; name?: string | null; role: string } & DefaultSession['user']
  }
}
```
В `jwt` callback:
```ts
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role?: string }).role ?? 'user'
      }
      return token
    },
```
В `session` callback:
```ts
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      session.user.role = (token.role as string) ?? 'user'
      return session
    },
```

- [ ] **Step 3: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run && pnpm build`
Expected: без регрессий (auth-callbacks не юнит-тестируются — проверяются tsc/build).
```bash
git add auth.ts
git commit -m "feat(admin): carry user role through JWT session"
```

---

## Task 3: `isAdmin` guard (TDD)

**Files:**
- Create: `lib/admin/guard.ts`
- Test: `tests/lib/admin/guard.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/lib/admin/guard.test.ts
import { isAdmin } from '@/lib/admin/guard'
import { describe, expect, it } from 'vitest'

describe('isAdmin', () => {
  it('true для role=admin', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } })).toBe(true)
  })
  it('false для role=user', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c', role: 'user' } })).toBe(false)
  })
  it('false для null-сессии', () => {
    expect(isAdmin(null)).toBe(false)
  })
  it('false если role отсутствует', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c' } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm exec vitest run tests/lib/admin/guard.test.ts` → FAIL (module not found)

- [ ] **Step 3: Реализация**

```ts
// lib/admin/guard.ts
type SessionLike = { user?: { role?: string | null } | null } | null

export function isAdmin(session: SessionLike): boolean {
  return session?.user?.role === 'admin'
}
```

- [ ] **Step 4: Run → PASS** (`pnpm exec vitest run tests/lib/admin/guard.test.ts`, 4 tests)

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`
```bash
git add lib/admin/guard.ts tests/lib/admin/guard.test.ts
git commit -m "feat(admin): isAdmin role guard"
```

---

## Task 4: format-хелперы для UI (TDD)

**Files:**
- Create: `lib/admin/format.ts`
- Test: `tests/lib/admin/format.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/lib/admin/format.test.ts
import { barPercent, successRate } from '@/lib/admin/format'
import { describe, expect, it } from 'vitest'

describe('barPercent', () => {
  it('доля от максимума в процентах', () => {
    expect(barPercent(5, 10)).toBe(50)
    expect(barPercent(10, 10)).toBe(100)
  })
  it('0 при max=0 (без деления на ноль)', () => {
    expect(barPercent(3, 0)).toBe(0)
  })
  it('клампит в [0,100]', () => {
    expect(barPercent(15, 10)).toBe(100)
    expect(barPercent(-1, 10)).toBe(0)
  })
})

describe('successRate', () => {
  it('процент успешных, округлённый', () => {
    expect(successRate(3, 4)).toBe(75)
  })
  it('0 при total=0', () => {
    expect(successRate(0, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Реализация**

```ts
// lib/admin/format.ts
export function barPercent(value: number, max: number): number {
  if (max <= 0) return 0
  const pct = (value / max) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export function successRate(ok: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((ok / total) * 100)
}
```

- [ ] **Step 4: Run → PASS** (5 tests)

- [ ] **Step 5: Гейты + коммит**

```bash
git add lib/admin/format.ts tests/lib/admin/format.test.ts
git commit -m "feat(admin): bar/success-rate format helpers"
```

---

## Task 5: `logEvent` + точки эмита

**Files:**
- Create: `lib/events/log.ts`
- Test: `tests/lib/events/log.test.ts`
- Modify: `app/api/scenarios/[id]/export/route.ts`, `auth.ts`, `app/app/library/actions.ts`

- [ ] **Step 1: Failing test (стаб-БД, без сети)**

```ts
// tests/lib/events/log.test.ts
import { logEvent } from '@/lib/events/log'
import { describe, expect, it, vi } from 'vitest'

function fakeDb() {
  const calls: unknown[] = []
  return {
    calls,
    insert() {
      return {
        values(v: unknown) {
          calls.push(v)
          return Promise.resolve()
        },
      }
    },
  }
}

describe('logEvent', () => {
  it('вставляет событие с type/userId/meta', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await logEvent('export', { userId: 'u1', meta: { format: 'pdf' } }, db as any)
    expect(db.calls[0]).toMatchObject({ type: 'export', userId: 'u1', meta: { format: 'pdf' } })
  })
  it('не бросает при сбое БД (best-effort)', async () => {
    const throwing = {
      insert() {
        throw new Error('db down')
      },
    }
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await expect(logEvent('login', { userId: 'u1' }, throwing as any)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Реализация**

```ts
// lib/events/log.ts
import { db as realDb } from '@/db'
import { events } from '@/db/schema'

export type EventType = 'export' | 'login' | 'search'
type Db = typeof realDb

export async function logEvent(
  type: EventType,
  opts: { userId?: string | null; meta?: Record<string, unknown> } = {},
  db: Db = realDb,
): Promise<void> {
  try {
    await db.insert(events).values({
      type,
      userId: opts.userId ?? null,
      meta: opts.meta ?? null,
    })
  } catch (e) {
    console.error('logEvent failed (non-fatal):', e)
  }
}
```

- [ ] **Step 4: Run → PASS** (2 tests)

- [ ] **Step 5: Эмит при экспорте**

В `app/api/scenarios/[id]/export/route.ts`: после успешной валидации/загрузки сценария и определения `format`, перед `return` с файлом, добавь best-effort лог. Импорт: `import { logEvent } from '@/lib/events/log'`. Перед возвратом ответа:
```ts
  await logEvent('export', { userId: session.user.id, meta: { format } })
```
(Размести после проверки владения и формата; `session.user.id` и `format` уже в scope — сверь имена переменных в файле.)

- [ ] **Step 6: Эмит при логине (в `auth.ts` `authorize`)**

В `authorize`, сразу ПЕРЕД `return { id: user.id, ... }` (т.е. после успешной `verifyPassword`):
```ts
        const { logEvent } = await import('@/lib/events/log')
        await logEvent('login', { userId: user.id })
```
(Динамический import, чтобы не тянуть в edge-bundle лишнего; best-effort внутри `logEvent`.)

- [ ] **Step 7: Эмит при поиске (в `app/app/library/actions.ts`)**

В `searchSharedAction`, после прохождения rate-limit и `const q = query.trim()`, добавь (только для непустого запроса, чтобы не засорять):
```ts
  if (q.length > 0) {
    const { logEvent } = await import('@/lib/events/log')
    await logEvent('search', { userId: session.user.id, meta: { query: q } })
  }
```
Импорт динамический — единообразно. Размести так, чтобы лог шёл и для пустого, и для непустого по желанию; здесь логируем только непустые.

- [ ] **Step 8: Гейты + коммит**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: 194 pass / 3 skip (+2 новых), build зелёный.
```bash
git add lib/events/log.ts tests/lib/events/log.test.ts app/api/scenarios/[id]/export/route.ts auth.ts app/app/library/actions.ts
git commit -m "feat(admin): events log + emit on export, login, search"
```

---

## Task 6: модуль агрегатов `lib/admin/stats.ts`

**Files:**
- Create: `lib/admin/stats.ts`

Контекст: функции читают ВСЕ данные (admin), `db` инъектируется. Используем `db.execute(sql\`...\`)`, результат — массив строк (как в `app/app/library/actions.ts` и `tests/smoke`). Числа из Postgres приходят строками → оборачивать `Number(...)`.

- [ ] **Step 1: Реализация**

```ts
// lib/admin/stats.ts
import { db as realDb } from '@/db'
import { sql } from 'drizzle-orm'

type Db = typeof realDb
type Row = Record<string, unknown>
const rows = (r: unknown) => r as unknown as Row[]

export type GenerationStats = {
  total: number
  ok: number
  error: number
  avgLatencyMs: number | null
  byDay: Array<{ day: string; count: number }>
}
export async function generationStats(db: Db = realDb): Promise<GenerationStats> {
  const [agg] = rows(
    await db.execute(sql`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE status='ok') AS ok,
        count(*) FILTER (WHERE status='error') AS error,
        round(avg(latency_ms)) AS avg_latency
      FROM generations`),
  )
  const day = rows(
    await db.execute(sql`
      SELECT to_char(date(created_at),'YYYY-MM-DD') AS day, count(*) AS count
      FROM generations
      WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day`),
  )
  return {
    total: Number(agg?.total ?? 0),
    ok: Number(agg?.ok ?? 0),
    error: Number(agg?.error ?? 0),
    avgLatencyMs: agg?.avg_latency == null ? null : Number(agg.avg_latency),
    byDay: day.map((r) => ({ day: String(r.day), count: Number(r.count) })),
  }
}

export type KeyCount = { key: string; count: number }
export type ContentStats = {
  topTopics: KeyCount[]
  byDirection: KeyCount[]
  byGrade: KeyCount[]
  byFormat: KeyCount[]
  byDuration: KeyCount[]
}
async function groupCount(db: Db, col: string): Promise<KeyCount[]> {
  // col — доверенное имя колонки (не пользовательский ввод)
  const r = rows(
    await db.execute(
      sql`SELECT ${sql.raw(col)}::text AS key, count(*) AS count
          FROM scenarios GROUP BY ${sql.raw(col)} ORDER BY count DESC`,
    ),
  )
  return r.map((x) => ({ key: String(x.key), count: Number(x.count) }))
}
export async function contentStats(db: Db = realDb): Promise<ContentStats> {
  const topTopics = rows(
    await db.execute(sql`
      SELECT topic AS key, count(*) AS count
      FROM scenarios GROUP BY topic ORDER BY count DESC LIMIT 10`),
  ).map((x) => ({ key: String(x.key), count: Number(x.count) }))
  return {
    topTopics,
    byDirection: await groupCount(db, 'direction'),
    byGrade: await groupCount(db, 'grade'),
    byFormat: await groupCount(db, 'format'),
    byDuration: await groupCount(db, 'duration_min'),
  }
}

export type UserStats = {
  totalUsers: number
  activeUsers: number
  newByDay: Array<{ day: string; count: number }>
  topUsers: Array<{ email: string; count: number }>
}
export async function userStats(db: Db = realDb): Promise<UserStats> {
  const [tot] = rows(await db.execute(sql`SELECT count(*) AS c FROM users`))
  const [act] = rows(
    await db.execute(sql`
      SELECT count(DISTINCT user_id) AS c FROM generations
      WHERE created_at >= now() - interval '30 days'`),
  )
  const newByDay = rows(
    await db.execute(sql`
      SELECT to_char(date(created_at),'YYYY-MM-DD') AS day, count(*) AS count
      FROM users WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day`),
  ).map((r) => ({ day: String(r.day), count: Number(r.count) }))
  const topUsers = rows(
    await db.execute(sql`
      SELECT u.email AS email, count(*) AS count
      FROM generations g JOIN users u ON u.id = g.user_id
      GROUP BY u.email ORDER BY count DESC LIMIT 10`),
  ).map((r) => ({ email: String(r.email), count: Number(r.count) }))
  return {
    totalUsers: Number(tot?.c ?? 0),
    activeUsers: Number(act?.c ?? 0),
    newByDay,
    topUsers,
  }
}

export type CommunityStats = {
  totalLikes: number
  totalShared: number
  topShared: Array<{ topic: string; likeCount: number }>
  planCoverage: { closed: number; total: number }
}
export async function communityStats(db: Db = realDb): Promise<CommunityStats> {
  const [likes] = rows(await db.execute(sql`SELECT count(*) AS c FROM likes`))
  const [shared] = rows(await db.execute(sql`SELECT count(*) AS c FROM shared_scenarios`))
  const topShared = rows(
    await db.execute(sql`
      SELECT topic, like_count AS "likeCount"
      FROM shared_scenarios ORDER BY like_count DESC LIMIT 10`),
  ).map((r) => ({ topic: String(r.topic), likeCount: Number(r.likeCount) }))
  const [cov] = rows(
    await db.execute(sql`
      SELECT
        (SELECT count(DISTINCT source_plan_topic_id) FROM scenarios
         WHERE source_plan_topic_id IS NOT NULL) AS closed,
        (SELECT count(*) FROM plan_topics) AS total`),
  )
  return {
    totalLikes: Number(likes?.c ?? 0),
    totalShared: Number(shared?.c ?? 0),
    topShared,
    planCoverage: { closed: Number(cov?.closed ?? 0), total: Number(cov?.total ?? 0) },
  }
}

export type EventStats = {
  byType: KeyCount[]
  topSearches: KeyCount[]
  exportFormats: KeyCount[]
}
export async function eventStats(db: Db = realDb): Promise<EventStats> {
  const byType = rows(
    await db.execute(sql`
      SELECT type AS key, count(*) AS count FROM events
      WHERE created_at >= now() - interval '30 days'
      GROUP BY type ORDER BY count DESC`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  const topSearches = rows(
    await db.execute(sql`
      SELECT meta->>'query' AS key, count(*) AS count FROM events
      WHERE type='search' AND meta->>'query' IS NOT NULL
      GROUP BY key ORDER BY count DESC LIMIT 10`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  const exportFormats = rows(
    await db.execute(sql`
      SELECT meta->>'format' AS key, count(*) AS count FROM events
      WHERE type='export' AND meta->>'format' IS NOT NULL
      GROUP BY key ORDER BY count DESC`),
  ).map((r) => ({ key: String(r.key), count: Number(r.count) }))
  return { byType, topSearches, exportFormats }
}
```

ВАЖНО: проверь имена колонок против `db/schema.ts`: `plan_topics` — поле «закрыто» (флаг готовности темы). Прочитай схему `planTopics`; если флаг называется НЕ `done` (например `closed`/`status`/`generated`), поправь SQL в `communityStats` под реальное имя. Если такого булева нет, а «закрытость» определяется наличием связанного сценария — замени на подсчёт через `scenarios.source_plan_topic_id` (тогда `closed` = `count(DISTINCT source_plan_topic_id)` из `scenarios`, `total` = `count(*)` из `plan_topics`). Выбери вариант, соответствующий тому, как `/app/plans` считает прогресс (прочитай `app/app/plans/page.tsx`).

- [ ] **Step 2: tsc проверяет SQL-обёртки**

Run: `pnpm exec tsc --noEmit && pnpm lint`

- [ ] **Step 3: Smoke одной функции (живая БД)**

Дополни `tests/smoke/admin-schema.test.ts` кейсом (или отдельный файл `tests/smoke/admin-stats.test.ts`):
```ts
import { generationStats } from '@/lib/admin/stats'
import { db } from '@/db'
// ... в describe:
  it('generationStats возвращает числа', async () => {
    const s = await generationStats(db)
    expect(typeof s.total).toBe('number')
    expect(Array.isArray(s.byDay)).toBe(true)
  })
```

- [ ] **Step 4: Гейты + коммит**

Run: `pnpm exec vitest run tests/smoke && pnpm exec tsc --noEmit && pnpm lint`
```bash
git add lib/admin/stats.ts tests/smoke/
git commit -m "feat(admin): aggregate stats module (generations, content, users, community, events)"
```

---

## Task 7: UI-компоненты `components/admin/`

**Files:**
- Create: `components/admin/SectionCard.tsx`, `KpiCard.tsx`, `BarList.tsx`, `StatTable.tsx`

Контекст: server-компоненты (без `'use client'`), стиль из `design_example` (brand/neutral, `shadow-card`, `ring-1`, `font-display`). Используют `barPercent` из `@/lib/admin/format`.

- [ ] **Step 1: SectionCard**

```tsx
// components/admin/SectionCard.tsx
export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-neutral-0 p-5 shadow-card ring-1 ring-neutral-200">
      <h2 className="mb-4 font-display text-lg font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  )
}
```

- [ ] **Step 2: KpiCard**

```tsx
// components/admin/KpiCard.tsx
export function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg bg-neutral-0 p-4 shadow-card ring-1 ring-neutral-200">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-neutral-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  )
}
```

- [ ] **Step 3: BarList**

```tsx
// components/admin/BarList.tsx
import { barPercent } from '@/lib/admin/format'

export function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) return <p className="text-sm text-neutral-400">Нет данных</p>
  const max = Math.max(...items.map((i) => i.value))
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm text-neutral-700">
            <span className="truncate pr-2">{i.label}</span>
            <span className="tabular-nums text-neutral-500">{i.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${barPercent(i.value, max)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: StatTable**

```tsx
// components/admin/StatTable.tsx
export function StatTable({
  columns,
  rows,
}: {
  columns: [string, string]
  rows: Array<{ label: string; value: string | number }>
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400">Нет данных</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-neutral-500">
          <th className="pb-2 font-medium">{columns[0]}</th>
          <th className="pb-2 text-right font-medium">{columns[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-neutral-100">
            <td className="py-1.5 text-neutral-800">{r.label}</td>
            <td className="py-1.5 text-right tabular-nums text-neutral-600">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`
```bash
git add components/admin/
git commit -m "feat(admin): stat UI primitives (SectionCard, KpiCard, BarList, StatTable)"
```

---

## Task 8: страница `/app/admin` + навбар + role в layout

**Files:**
- Create: `app/app/admin/page.tsx`
- Modify: `components/nav/AppNavbar.tsx`, `app/app/layout.tsx`

- [ ] **Step 1: Страница с role-гардом**

```tsx
// app/app/admin/page.tsx
import { auth } from '@/auth'
import { BarList } from '@/components/admin/BarList'
import { KpiCard } from '@/components/admin/KpiCard'
import { SectionCard } from '@/components/admin/SectionCard'
import { StatTable } from '@/components/admin/StatTable'
import { db } from '@/db'
import { isAdmin } from '@/lib/admin/guard'
import { successRate } from '@/lib/admin/format'
import {
  communityStats,
  contentStats,
  eventStats,
  generationStats,
  userStats,
} from '@/lib/admin/stats'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await auth()
  if (!isAdmin(session)) redirect('/app')

  const [gen, content, users, community, ev] = await Promise.all([
    generationStats(db),
    contentStats(db),
    userStats(db),
    communityStats(db),
    eventStats(db),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">Статистика</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Генераций всего" value={gen.total} />
        <KpiCard label="Успешных" value={`${successRate(gen.ok, gen.total)}%`} hint={`${gen.error} ошибок`} />
        <KpiCard label="Средняя задержка" value={gen.avgLatencyMs == null ? '—' : `${gen.avgLatencyMs} мс`} hint="часть стрим-генераций без замера" />
        <KpiCard label="Пользователей" value={users.totalUsers} hint={`${users.activeUsers} активны за 30д`} />
      </div>

      <SectionCard title="Генерации за 30 дней">
        <BarList items={gen.byDay.map((d) => ({ label: d.day, value: d.count }))} />
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Популярные темы">
          <StatTable columns={['Тема', 'Сценариев']} rows={content.topTopics.map((t) => ({ label: t.key, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По направлению">
          <BarList items={content.byDirection.map((t) => ({ label: t.key, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По классу">
          <BarList items={content.byGrade.map((t) => ({ label: `${t.key} класс`, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По формату">
          <BarList items={content.byFormat.map((t) => ({ label: t.key, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По длительности">
          <BarList items={content.byDuration.map((t) => ({ label: `${t.key} мин`, value: t.count }))} />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Новые пользователи за 30 дней">
          <BarList items={users.newByDay.map((d) => ({ label: d.day, value: d.count }))} />
        </SectionCard>
        <SectionCard title="Топ пользователей по генерациям">
          <StatTable columns={['Email', 'Генераций']} rows={users.topUsers.map((u) => ({ label: u.email, value: u.count }))} />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Сообщество">
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Лайков" value={community.totalLikes} />
            <KpiCard label="Расшарено" value={community.totalShared} />
          </div>
          <div className="mt-4">
            <StatTable columns={['Сценарий', '❤']} rows={community.topShared.map((s) => ({ label: s.topic, value: s.likeCount }))} />
          </div>
          <p className="mt-3 text-sm text-neutral-500">
            Покрытие планов: {community.planCoverage.closed} из {community.planCoverage.total} тем
          </p>
        </SectionCard>
        <SectionCard title="События за 30 дней">
          <BarList items={ev.byType.map((t) => ({ label: t.key, value: t.count }))} />
          <div className="mt-4">
            <StatTable columns={['Поисковый запрос', 'Раз']} rows={ev.topSearches.map((s) => ({ label: s.key, value: s.count }))} />
          </div>
          <p className="mt-3 text-xs text-neutral-400">Данные событий собираются с момента внедрения.</p>
        </SectionCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Навбар — ссылка «Админ» только для admin**

В `components/nav/AppNavbar.tsx` добавить проп `role?: string` и условную ссылку рядом с остальными:
```tsx
{role === 'admin' && (
  <Link href="/app/admin" className="hover:text-neutral-900">Админ</Link>
)}
```
Сигнатуру компонента расширить: `{ userName, userEmail, role }`.

- [ ] **Step 3: Прокинуть role из layout**

В `app/app/layout.tsx` передать роль в навбар:
```tsx
<AppNavbar userName={session.user.name} userEmail={session.user.email ?? ''} role={session.user.role} />
```
(`session.user.role` доступен после Task 2.)

- [ ] **Step 4: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: роут `/app/admin` в выводе билда.
```bash
git add app/app/admin/page.tsx components/nav/AppNavbar.tsx app/app/layout.tsx
git commit -m "feat(admin): /app/admin stats page + admin-only navbar link"
```

---

## Task 9: скрипт назначения админа

**Files:**
- Create: `scripts/set-admin.ts`
- Modify: `package.json`

- [ ] **Step 1: Реализация** (по образцу `scripts/seed-demo.ts` — dotenv-загрузка, db-import, prod-guard не нужен, это не создание дефолт-креденшелов)

```ts
// scripts/set-admin.ts
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const email = process.argv[2]?.toLowerCase().trim()
  if (!email) {
    console.error('Использование: pnpm set:admin <email>')
    process.exit(1)
  }
  const res = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email })
  if (res.length === 0) {
    console.error(`Пользователь не найден: ${email}`)
    process.exit(1)
  }
  console.log(`Назначен админом: ${res[0].email} (id=${res[0].id})`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```
Сверь стиль dotenv-загрузки с `scripts/seed-demo.ts` (там `config({ path: '.env.local' }); config()`), приведи к идентичному.

- [ ] **Step 2: npm-скрипт**

В `package.json` `"scripts"`: `"set:admin": "tsx scripts/set-admin.ts"` (стиль `tsx scripts/...` как у `seed:demo`).

- [ ] **Step 3: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`
```bash
git add scripts/set-admin.ts package.json
git commit -m "feat(admin): set-admin CLI script"
```

---

## Task 10: финализация — гейты, ревью, статус, тег

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Полные гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run && pnpm build`
Expected: tsc/lint/build зелёные; vitest ~199 pass / 3 skip (baseline 192 + новые: guard 4, format 5, logEvent 2, admin-schema 2-3 = ~13-14 → итог ~205; точное число не критично, главное 0 fail).

- [ ] **Step 2: Финальное холистическое code-review** (subagent) — связность, что агрегаты читаются ТОЛЬКО под `isAdmin`-гардом, role корректно течёт JWT→session→page/navbar, logEvent best-effort и не ломает потоки, нет утечки `design_example` в коммиты, нет raw SQL с пользовательским вводом (имена колонок в `groupCount` — доверенные литералы, не ввод).

- [ ] **Step 3: Обновить «Статус реализации» в `CLAUDE.md`** — добавить «Plan 10 Admin-stats — ГОТОВ»: роли (`users.role`), events-лог, агрегаты, страница `/app/admin`, скрипт `set:admin`; отметить ручные шаги (назначить админа `pnpm set:admin`, события копятся вперёд).

- [ ] **Step 4: Коммит + тег**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): Plan 10 admin-stats done status"
git tag admin-stats-done
```

---

## Self-Review

**Spec coverage:**
- §3 роли (`users.role` + JWT + гард + set-admin) → Tasks 1,2,3,9 ✓
- §4 4 блока статистики → Task 6 (stats) + Task 8 (рендер) ✓
- §5 events-лог + 3 точки эмита → Task 5 ✓
- §6 UI (карточки/таблицы/bar'ы, навбар) → Tasks 7,8 ✓
- §7 тесты (TDD guard/format/logEvent, smoke схемы/stats) → Tasks 3,4,5,6 + Task 1 ✓
- §9 безопасность (гард, best-effort, без мутаций) → Tasks 2,3,5,8 ✓

**Placeholder scan:** один помеченный пункт — имя «закрытой» темы в `communityStats` (Task 6) требует сверки с реальной схемой `plan_topics`/логикой `/app/plans`; это инструкция уточнить по факту, не код-плейсхолдер (дан конкретный fallback через `source_plan_topic_id`).

**Type consistency:** `isAdmin(SessionLike)`, `barPercent`/`successRate`, `logEvent(type, opts, db)`, `GenerationStats/ContentStats/UserStats/CommunityStats/EventStats`, `KeyCount` — имена согласованы между Task 6 (определение) и Task 8 (использование). `KpiCard/BarList/StatTable/SectionCard` пропсы совпадают между Task 7 и Task 8.
