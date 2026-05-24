# Переработка дашборда `/app` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `/app` из «последних 10 сценариев» в рабочую главную: поиск/фильтр по личной библиотеке (#28) + виджет «Ближайшие мероприятия» (темы плана с датой → fallback на календарь поводов).

**Architecture:** `app/app/page.tsx` остаётся серверным компонентом, читает `searchParams` и строит фильтрованный запрос к `scenarios`. Поисковая строка/фильтры — клиентский компонент, пушит значения в URL. «Ближайшие мероприятия» считает чистая функция `lib/dashboard/upcoming.ts` (TDD), страница маппит результат в карточки-ссылки на существующие префил-потоки `/app/new`.

**Tech Stack:** Next.js 15 (App Router, RSC), Drizzle ORM, Tailwind, Vitest. Без миграций.

**Spec:** `docs/superpowers/specs/2026-05-24-dashboard-redesign-design.md`

---

## File Structure

- **Create** `lib/dashboard/upcoming.ts` — чистая логика выбора 3 ближайших событий + разрешение дат. Без БД/сети.
- **Create** `tests/lib/dashboard/upcoming.test.ts` — unit-тесты (TDD).
- **Create** `components/dashboard/ScenarioSearch.tsx` — клиентский поиск + фильтры, пушит в URL.
- **Modify** `app/app/page.tsx` — фильтрованный запрос сценариев, рендер `ScenarioSearch`, виджет «Ближайшие мероприятия», новая раскладка.

Гейты на каждом коммите: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

---

## Task 1: Чистая логика «ближайших мероприятий» (`lib/dashboard/upcoming.ts`)

**Files:**
- Create: `lib/dashboard/upcoming.ts`
- Test: `tests/lib/dashboard/upcoming.test.ts`

- [ ] **Step 1: Write the failing test**

Создать `tests/lib/dashboard/upcoming.test.ts`:

```ts
import type { CalendarOccasion } from '@/lib/calendar-events'
import { pickUpcoming, resolveUpcomingDate } from '@/lib/dashboard/upcoming'
import { describe, expect, it } from 'vitest'

const TODAY = new Date(Date.UTC(2026, 4, 24)) // 2026-05-24

const CAL: CalendarOccasion[] = [
  { date: '09-01', title: 'День знаний', suggested_direction: 'Познавательное', suggested_formats: ['беседа'] },
  { date: '06-01', title: 'День защиты детей', suggested_direction: 'Гражданское', suggested_formats: ['игра'] },
  { date: '05-09', title: 'День Победы', suggested_direction: 'Патриотическое', suggested_formats: ['беседа'] },
  { date: '12-12', title: 'День Конституции', suggested_direction: 'Гражданское', suggested_formats: ['квиз'] },
]

describe('resolveUpcomingDate', () => {
  it('rolls a no-year DD.MM forward to the nearest future occurrence', () => {
    // 01.09 ещё не наступило в 2026 → 2026-09-01
    expect(resolveUpcomingDate('01.09', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('rolls a passed no-year DD.MM into next year', () => {
    // 09.05 уже прошло относительно 24.05.2026 → 2027-05-09
    expect(resolveUpcomingDate('09.05', TODAY)?.toISOString().slice(0, 10)).toBe('2027-05-09')
  })

  it('accepts slash separator', () => {
    expect(resolveUpcomingDate('1/9', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('keeps an explicit future year date', () => {
    expect(resolveUpcomingDate('01.09.2026', TODAY)?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('drops an explicit past year date', () => {
    expect(resolveUpcomingDate('01.09.2020', TODAY)).toBeNull()
  })

  it('drops an invalid calendar date', () => {
    expect(resolveUpcomingDate('31.02', TODAY)).toBeNull()
  })

  it('drops unparseable junk', () => {
    expect(resolveUpcomingDate('как-то так', TODAY)).toBeNull()
  })
})

describe('pickUpcoming', () => {
  it('returns 3 nearest plan topics with dates, ascending', () => {
    const out = pickUpcoming({
      today: TODAY,
      planTopics: [
        { id: 'a', title: 'Дружба', plannedDate: '01.09', scenarioId: null },
        { id: 'b', title: 'Семья', plannedDate: '15.06', scenarioId: 's1' },
        { id: 'c', title: 'Труд', plannedDate: '01.10', scenarioId: null },
        { id: 'd', title: 'Без даты', plannedDate: null, scenarioId: null },
      ],
      calendar: CAL,
    })
    expect(out.map((i) => i.title)).toEqual(['Семья', 'Дружба', 'Труд'])
    expect(out[0]).toMatchObject({ source: 'plan', planTopicId: 'b', scenarioId: 's1' })
  })

  it('falls back to calendar when no plan topic has a usable date', () => {
    const out = pickUpcoming({
      today: TODAY,
      planTopics: [{ id: 'x', title: 'Тема', plannedDate: null, scenarioId: null }],
      calendar: CAL,
    })
    // ближайшие будущие поводы от 24.05.2026: 01.06, 09.05→2027, 01.09 ... сортировка по дате
    expect(out.every((i) => i.source === 'calendar')).toBe(true)
    expect(out).toHaveLength(3)
    expect(out[0].title).toBe('День защиты детей') // 2026-06-01 — ближайший
  })

  it('returns empty array when neither source yields anything', () => {
    expect(pickUpcoming({ today: TODAY, planTopics: [], calendar: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/dashboard/upcoming.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard/upcoming'`.

- [ ] **Step 3: Write the implementation**

Создать `lib/dashboard/upcoming.ts`:

```ts
import type { CalendarOccasion } from '@/lib/calendar-events'

export type UpcomingItem = {
  title: string
  date: Date
  source: 'plan' | 'calendar'
  planTopicId?: string
  scenarioId?: string | null
  calendarDate?: string // 'MM-DD'
}

const RU_DATE = /^(\d{1,2})[./](\d{1,2})(?:[./]((?:19|20)\d{2}))?$/

function makeUtcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d
}

function startOfUtcDay(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
}

// Ближайшее будущее вхождение day/month относительно today (учебный год от сегодня).
function forwardOccurrence(month: number, day: number, today: Date): Date | null {
  const floor = startOfUtcDay(today)
  const base = today.getUTCFullYear()
  for (let y = base; y <= base + 8; y++) {
    const d = makeUtcDate(y, month, day)
    if (d && d.getTime() >= floor) return d
  }
  return null
}

export function resolveUpcomingDate(raw: string, today: Date): Date | null {
  const m = raw.trim().match(RU_DATE)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (m[3]) {
    const d = makeUtcDate(Number(m[3]), month, day)
    if (!d || d.getTime() < startOfUtcDay(today)) return null
    return d
  }
  return forwardOccurrence(month, day, today)
}

export function pickUpcoming(args: {
  today: Date
  planTopics: { id: string; title: string; plannedDate: string | null; scenarioId: string | null }[]
  calendar: CalendarOccasion[]
}): UpcomingItem[] {
  const { today, planTopics, calendar } = args

  const planItems: UpcomingItem[] = []
  for (const t of planTopics) {
    if (!t.plannedDate) continue
    const d = resolveUpcomingDate(t.plannedDate, today)
    if (!d) continue
    planItems.push({
      title: t.title,
      date: d,
      source: 'plan',
      planTopicId: t.id,
      scenarioId: t.scenarioId,
    })
  }
  if (planItems.length > 0) {
    return planItems.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3)
  }

  const calItems: UpcomingItem[] = []
  for (const o of calendar) {
    const [mm, dd] = o.date.split('-').map(Number)
    const d = forwardOccurrence(mm, dd, today)
    if (!d) continue
    calItems.push({ title: o.title, date: d, source: 'calendar', calendarDate: o.date })
  }
  return calItems.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/dashboard/upcoming.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Verify gates**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: оба exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/upcoming.ts tests/lib/dashboard/upcoming.test.ts
git commit -m "feat(dashboard): чистая логика ближайших мероприятий (#36)"
```

---

## Task 2: Клиентский компонент поиска + фильтров (`ScenarioSearch`)

**Files:**
- Create: `components/dashboard/ScenarioSearch.tsx`

Компонент не имеет unit-тестов (UI-склейка) — проверяется `tsc`/`lint`/`build`. Читает текущие значения из URL, при изменении пушит обновлённый query через `router.replace`. Текст дебаунсится 300 мс, селекты применяются сразу.

- [ ] **Step 1: Write the component**

Создать `components/dashboard/ScenarioSearch.tsx`:

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { DIRECTIONS, FORMATS, GRADES, formatGrade } from '@/lib/scenario/options'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

const selectClass =
  'h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-200'

export function ScenarioSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function pushParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const s = next.toString()
    router.replace(s ? `${pathname}?${s}` : pathname)
  }

  function onText(value: string) {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => pushParam('q', value.trim()), 300)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => onText(e.target.value)}
        placeholder="Поиск по названию сценария…"
        className="sm:max-w-xs"
      />
      <select
        className={selectClass}
        value={sp.get('direction') ?? ''}
        onChange={(e) => pushParam('direction', e.target.value)}
      >
        <option value="">Все направления</option>
        {DIRECTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={sp.get('grade') ?? ''}
        onChange={(e) => pushParam('grade', e.target.value)}
      >
        <option value="">Все классы</option>
        {GRADES.map((g) => (
          <option key={g} value={String(g)}>
            {formatGrade(g)}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={sp.get('format') ?? ''}
        onChange={(e) => pushParam('format', e.target.value)}
      >
        <option value="">Все форматы</option>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: Verify gates**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: оба exit 0. (Компонент пока нигде не импортирован — это нормально; импорт добавит Task 3.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ScenarioSearch.tsx
git commit -m "feat(dashboard): поисковая строка и фильтры по сценариям (#36)"
```

---

## Task 3: Фильтрованный запрос сценариев + рендер поиска в `/app`

**Files:**
- Modify: `app/app/page.tsx`

Заменяем запрос «последние 10» на фильтрованный по `searchParams`, рендерим `ScenarioSearch` над списком, добавляем состояние «Ничего не найдено». Виджет «Ближайшие мероприятия» добавит Task 4 — здесь его ещё нет.

- [ ] **Step 1: Rewrite the page query and scenario list**

Полностью заменить содержимое `app/app/page.tsx` на:

```tsx
import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScenarioSearch } from '@/components/dashboard/ScenarioSearch'
import { db } from '@/db'
import { planTopics, scenarios, sharedScenarios, workPlans } from '@/db/schema'
import { DIRECTIONS, FORMATS, GRADES, formatGrade } from '@/lib/scenario/options'
import { and, count, desc, eq, ilike, isNotNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

type SearchParams = { q?: string; direction?: string; grade?: string; format?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const direction = DIRECTIONS.includes(sp.direction as never) ? sp.direction : undefined
  const gradeNum = Number(sp.grade)
  const grade = GRADES.includes(gradeNum as never) ? gradeNum : undefined
  const format = FORMATS.includes(sp.format as never) ? sp.format : undefined
  const hasQuery = Boolean(q || direction || grade !== undefined || format)

  const conds = [eq(scenarios.userId, userId)]
  if (q) conds.push(ilike(scenarios.title, `%${q}%`))
  if (direction) conds.push(eq(scenarios.direction, direction))
  if (grade !== undefined) conds.push(eq(scenarios.grade, grade))
  if (format) conds.push(eq(scenarios.format, format))

  const list = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      direction: scenarios.direction,
      grade: scenarios.grade,
      format: scenarios.format,
      createdAt: scenarios.createdAt,
    })
    .from(scenarios)
    .where(and(...conds))
    .orderBy(desc(scenarios.createdAt))
    .limit(100)

  const plans = await db
    .select({ id: workPlans.id, title: workPlans.title })
    .from(workPlans)
    .where(eq(workPlans.userId, userId))
    .orderBy(desc(workPlans.createdAt))
    .limit(3)

  const topicRows = await db
    .select({ id: planTopics.id, workPlanId: planTopics.workPlanId })
    .from(planTopics)
    .where(eq(planTopics.userId, userId))

  const scenarioTopicRows = await db
    .select({ id: scenarios.id, topicId: scenarios.sourcePlanTopicId })
    .from(scenarios)
    .where(and(eq(scenarios.userId, userId), isNotNull(scenarios.sourcePlanTopicId)))
  const scenarioByTopic = new Map<string, string>()
  for (const r of scenarioTopicRows) {
    if (r.topicId && !scenarioByTopic.has(r.topicId)) scenarioByTopic.set(r.topicId, r.id)
  }

  const planStats = plans.map((p) => {
    const ts = topicRows.filter((t) => t.workPlanId === p.id)
    return {
      ...p,
      total: ts.length,
      done: ts.filter((t) => scenarioByTopic.has(t.id)).length,
    }
  })

  const [sharedCountRow] = await db.select({ value: count() }).from(sharedScenarios)
  const sharedCount = sharedCountRow?.value ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">Мои сценарии</h1>
        <Button asChild>
          <Link href="/app/new">Создать сценарий</Link>
        </Button>
      </div>

      {planStats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {planStats.map((p) => (
            <Link key={p.id} href={`/app/plans/${p.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-neutral-600">
                  Закрыто {p.done}/{p.total} тем
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Link href="/app/library" className="block">
        <Card className="transition hover:shadow-hover">
          <CardHeader>
            <CardTitle className="text-base">Библиотека сообщества</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">{sharedCount} сценариев</CardContent>
        </Card>
      </Link>

      <ScenarioSearch />

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{hasQuery ? 'Ничего не найдено' : 'Пока пусто'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            {hasQuery
              ? 'Попробуйте изменить запрос или сбросить фильтры.'
              : 'Создайте первый сценарий — укажите направление, класс, тему, длительность и формат.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((s) => (
            <Link key={s.id} href={`/app/scenarios/${s.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  {[s.direction, formatGrade(s.grade), s.format].map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600"
                    >
                      {b}
                    </span>
                  ))}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify gates**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: тесты зелёные (без новых), lint/tsc exit 0, build содержит роут `/app` без ошибок.

- [ ] **Step 3: Commit**

```bash
git add app/app/page.tsx
git commit -m "feat(dashboard): поиск и фильтрация личной библиотеки сценариев (#36, #28)"
```

---

## Task 4: Виджет «Ближайшие мероприятия» на `/app`

**Files:**
- Modify: `app/app/page.tsx`

Добавляем расширенный запрос тем (с `title`/`plannedDate`), вызываем `pickUpcoming`, рендерим секцию из 3 карточек-ссылок между заголовком и прогрессом планов.

- [ ] **Step 1: Расширить запрос тем плана**

В `app/app/page.tsx` заменить запрос `topicRows` (он сейчас выбирает только `id`/`workPlanId`) на расширенный — добавить `title` и `plannedDate`:

```tsx
  const topicRows = await db
    .select({
      id: planTopics.id,
      workPlanId: planTopics.workPlanId,
      title: planTopics.title,
      plannedDate: planTopics.plannedDate,
    })
    .from(planTopics)
    .where(eq(planTopics.userId, userId))
```

- [ ] **Step 2: Посчитать ближайшие мероприятия**

Добавить импорты в начало файла:

```tsx
import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { type UpcomingItem, pickUpcoming } from '@/lib/dashboard/upcoming'
```

После того как `scenarioByTopic` построен (и до `return`), добавить:

```tsx
  const upcoming = pickUpcoming({
    today: new Date(),
    planTopics: topicRows.map((t) => ({
      id: t.id,
      title: t.title,
      plannedDate: t.plannedDate,
      scenarioId: scenarioByTopic.get(t.id) ?? null,
    })),
    calendar: CALENDAR_EVENTS,
  })

  function upcomingHref(item: UpcomingItem): string {
    if (item.source === 'plan') {
      if (item.scenarioId) return `/app/scenarios/${item.scenarioId}`
      return `/app/new?topic=${encodeURIComponent(item.title)}&planTopicId=${item.planTopicId}`
    }
    return `/app/new?topic=${encodeURIComponent(item.title)}&calendarDate=${item.calendarDate}`
  }

  const fmtDate = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
```

- [ ] **Step 3: Отрендерить секцию**

Вставить в JSX сразу после блока заголовка (`</div>` закрывающий «Мои сценарии» + кнопка) и ПЕРЕД блоком `planStats`:

```tsx
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">Ближайшие мероприятия</h2>
            <span className="text-xs text-neutral-500">
              {upcoming[0].source === 'plan' ? 'из вашего плана' : 'памятные даты учебного года'}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {upcoming.map((item) => (
              <Link key={`${item.source}-${item.planTopicId ?? item.calendarDate}`} href={upcomingHref(item)}>
                <Card className="h-full transition hover:shadow-hover">
                  <CardHeader>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm text-neutral-600">
                    <span>{fmtDate(item.date)}</span>
                    <span className="text-xs text-brand-600">
                      {item.source === 'plan' && item.scenarioId ? 'Открыть сценарий' : 'Создать →'}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 4: Verify gates**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное; роут `/app` собирается.

- [ ] **Step 5: Commit**

```bash
git add app/app/page.tsx
git commit -m "feat(dashboard): виджет «Ближайшие мероприятия» (#36)"
```

---

## Финальная проверка (после всех задач)

- [ ] `pnpm test` — все тесты зелёные, +10 новых в `tests/lib/dashboard/upcoming.test.ts`.
- [ ] `pnpm lint` exit 0, `pnpm exec tsc --noEmit` exit 0, `pnpm build` без ошибок (роут `/app` присутствует).
- [ ] Ручной UAT (живое окружение, перед демо):
  - поиск по названию сужает список; селекты фильтруют; сброс — пустой список снова показывает все;
  - «Ничего не найдено» при заведомо отсутствующем запросе;
  - у пользователя с планом с датами виджет показывает 3 ближайшие темы плана; ссылка ведёт на сценарий (если есть) или на `/app/new` с префилом;
  - у пользователя без плана (или без валидных дат) виджет показывает 3 ближайших повода календаря; ссылка ведёт на `/app/new?...&calendarDate=`;
  - изоляция: чужие сценарии/темы не видны (проверяется существующими предикатами `user_id`).

## Соответствие спеке (self-review)
- #28 поиск + фильтры → Task 2 (UI) + Task 3 (запрос). ✓
- Единый список заменяет «последние 10», cap 100, desc → Task 3. ✓
- Виджет «Ближайшие мероприятия», план→fallback календарь, парсинг дат без года → Task 1 (логика) + Task 4 (рендер/ссылки). ✓
- Изоляция по `user_id` на всех запросах → Task 3/4 (предикаты `eq(...userId)`). ✓
- Без миграций. ✓
- Порядок секций (заголовок → ближайшие → планы → библиотека → поиск → список) → Task 3/4. ✓
```
