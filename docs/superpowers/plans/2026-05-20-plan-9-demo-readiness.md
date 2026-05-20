# Plan 9 — Demo-readiness (Календарь + лендинг + polish + демо-prep)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть остаток DoD §12 спеки: календарь поводов с привязкой сценария к дате, публичный лендинг из `design_example`, накопленный security/PII-polish, и демо-prep (калибровочный скрипт, seed демо-аккаунта, UAT чек-лист) — финальная фаза перед демо.

**Architecture:** Монолит Next.js 15 (App Router) + Drizzle + Postgres/pgvector. Календарь = статический массив поводов (`lib/calendar-events.ts`, БЕЗ LLM) + новая таблица `calendar_events` для привязки сценариев пользователя к датам (изоляция по `user_id`). Security-polish переиспользует существующий `lib/ratelimit` и добавляет origin-проверку. Лендинг адаптирует компоненты из `design_example/` на существующие токены tailwind (brand/neutral/accent/warm, Inter+Onest).

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Postgres 16+pgvector, Tailwind, Auth.js v5 (JWT), Vitest, Biome, pnpm 9.

**Гейты (зелёные ПЕРЕД каждым коммитом):** `pnpm test` (baseline 173 pass / 3 skip), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

**Конвенции:** один коммит на задачу; TDD для нетривиальной чистой логики (тест сначала); юнит-тесты НЕ ходят в живую сеть/GigaChat (инъекция стабов); UI сверять с `design_example/`; UI только на русском; никаких raw SQL без `WHERE user_id = ?` для пользовательских таблиц.

**ВАЖНО:** `design_example/` лежит в worktree как untracked-папка (эталон, не для сборки) — НИКОГДА не делать `git add design_example`. Коммитить только конкретные файлы задачи.

---

## File Structure

**Создаются:**
- `lib/auth/origin.ts` — чистая проверка совпадения origin/host + хелпер на `headers()`
- `lib/auth/base-url.ts` — derive базового URL из заголовков запроса
- `lib/pii/scenario-scan.ts` — мягкое сканирование `ScenarioContent` на ПДн (warning, не блок)
- `lib/calendar-events.ts` — статический массив поводов + тип/валидатор
- `lib/calendar/events.ts` — data-access для `calendar_events` (изоляция по `user_id`)
- `app/app/calendar/page.tsx` — месячная сетка поводов + привязок пользователя
- `app/app/calendar/actions.ts` — server actions календаря (bind/unbind)
- `components/calendar/CalendarGrid.tsx` — клиентская сетка месяца
- `components/calendar/CalendarSourceTab.tsx` — пикер повода для формы `/app/new`
- `app/page.tsx` — **перезапись** публичного лендинга (адаптация `design_example`)
- `components/landing/*` — секции лендинга (Navbar/Hero/Features/HowItWorks/Audience/Cta/Footer)
- `scripts/calibrate-threshold.ts` — калибровка `SIMILARITY_THRESHOLD` (ручной прогон)
- `scripts/seed-demo.ts` — демо-аккаунт + примеры данных (ручной прогон)
- `docs/qa.md` — UAT чек-лист + ручные шаги перед демо
- тесты под каждую логическую задачу в `tests/...`

**Модифицируются:**
- `app/app/logout/route.ts` — origin-проверка + AUTH_URL из request
- `app/app/scenarios/[id]/actions.ts` — rate-limit на regenerate/useSharedAsIs + PII-warning при save
- `app/app/new/actions.ts` — rate-limit на prematch
- `app/app/new/page.tsx` — 3-й источник темы «Календарь поводов»
- `app/app/scenarios/[id]/editor.tsx` — показ PII-warning + кнопка «На дату»
- `db/schema.ts` — таблица `calendar_events`
- `components/nav/AppNavbar.tsx` — ссылка «Календарь»
- `CLAUDE.md` — раздел «Статус реализации»

---

## ОБЛАСТЬ A — Security / PII polish

### Task 1: Чистая проверка origin + применение на /app/logout (CSRF)

**Files:**
- Create: `lib/auth/origin.ts`
- Test: `tests/lib/auth/origin.test.ts`
- Modify: `app/app/logout/route.ts`

- [ ] **Step 1: Failing test для чистой функции**

```ts
// tests/lib/auth/origin.test.ts
import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '@/lib/auth/origin'

describe('isSameOrigin', () => {
  it('пропускает совпадающие origin и host', () => {
    expect(isSameOrigin('https://kc.example.com', 'kc.example.com')).toBe(true)
  })
  it('пропускает http origin с тем же host', () => {
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true)
  })
  it('блокирует чужой origin', () => {
    expect(isSameOrigin('https://evil.com', 'kc.example.com')).toBe(false)
  })
  it('блокирует, если origin отсутствует', () => {
    expect(isSameOrigin(null, 'kc.example.com')).toBe(false)
  })
  it('блокирует, если host отсутствует', () => {
    expect(isSameOrigin('https://kc.example.com', null)).toBe(false)
  })
  it('блокирует битый origin', () => {
    expect(isSameOrigin('not-a-url', 'kc.example.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Запуск — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/auth/origin.test.ts`
Expected: FAIL (`isSameOrigin is not a function` / модуль не найден)

- [ ] **Step 3: Реализация**

```ts
// lib/auth/origin.ts
import { headers } from 'next/headers'

/** Чистая проверка: host из Origin совпадает с Host запроса. */
export function isSameOrigin(originHeader: string | null, hostHeader: string | null): boolean {
  if (!originHeader || !hostHeader) return false
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}

/** Серверный хелпер: читает заголовки запроса и проверяет same-origin. */
export async function assertSameOrigin(): Promise<boolean> {
  const h = await headers()
  return isSameOrigin(h.get('origin'), h.get('host'))
}
```

- [ ] **Step 4: Запуск — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/auth/origin.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Применить origin-проверку в logout**

```ts
// app/app/logout/route.ts
import { signOut } from '@/auth'
import { baseUrlFromRequest } from '@/lib/auth/base-url'
import { assertSameOrigin } from '@/lib/auth/origin'
import { NextResponse } from 'next/server'

export async function POST() {
  if (!(await assertSameOrigin())) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 })
  }
  await signOut({ redirect: false })
  const base = await baseUrlFromRequest()
  return NextResponse.redirect(new URL('/', base))
}
```

> Примечание: `baseUrlFromRequest` появляется в Task 2. Реализуй Task 1 и Task 2 подряд; коммить Task 1 ТОЛЬКО после того, как Task 2 создаст `lib/auth/base-url.ts` (иначе билд упадёт). Если выполняешь строго по одной задаче — временно оставь в Task 1 редирект через `process.env.AUTH_URL ?? 'http://localhost:3000'`, а в Task 2 заменишь на `baseUrlFromRequest()`.

- [ ] **Step 6: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run tests/lib/auth/origin.test.ts`
Expected: всё зелёное

```bash
git add lib/auth/origin.ts tests/lib/auth/origin.test.ts app/app/logout/route.ts
git commit -m "feat(security): add same-origin guard for /app/logout (CSRF)"
```

---

### Task 2: AUTH_URL derive из request

**Files:**
- Create: `lib/auth/base-url.ts`
- Test: `tests/lib/auth/base-url.test.ts`
- Modify: `app/app/logout/route.ts` (импорт уже добавлен в Task 1)

- [ ] **Step 1: Failing test для чистой функции**

```ts
// tests/lib/auth/base-url.test.ts
import { describe, expect, it } from 'vitest'
import { baseUrlFrom } from '@/lib/auth/base-url'

describe('baseUrlFrom', () => {
  it('строит https из x-forwarded-proto + host', () => {
    expect(baseUrlFrom('kc.example.com', 'https')).toBe('https://kc.example.com')
  })
  it('дефолтит на http при отсутствии proto', () => {
    expect(baseUrlFrom('localhost:3000', null)).toBe('http://localhost:3000')
  })
  it('падает на env AUTH_URL при отсутствии host', () => {
    expect(baseUrlFrom(null, null, 'https://fallback.example.com')).toBe(
      'https://fallback.example.com',
    )
  })
  it('падает на localhost при отсутствии host и env', () => {
    expect(baseUrlFrom(null, null, undefined)).toBe('http://localhost:3000')
  })
})
```

- [ ] **Step 2: Запуск — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/auth/base-url.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация**

```ts
// lib/auth/base-url.ts
import { headers } from 'next/headers'

/** Чистая сборка базового URL из host/proto с fallback на env/localhost. */
export function baseUrlFrom(
  host: string | null,
  proto: string | null,
  envUrl: string | undefined = process.env.AUTH_URL,
): string {
  if (host) return `${proto ?? 'http'}://${host}`
  return envUrl ?? 'http://localhost:3000'
}

/** Серверный хелпер: derive базового URL из заголовков текущего запроса. */
export async function baseUrlFromRequest(): Promise<string> {
  const h = await headers()
  return baseUrlFrom(h.get('host'), h.get('x-forwarded-proto'))
}
```

- [ ] **Step 4: Запуск — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/auth/base-url.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run tests/lib/auth`
Expected: зелёное (logout уже использует `baseUrlFromRequest`)

```bash
git add lib/auth/base-url.ts tests/lib/auth/base-url.test.ts app/app/logout/route.ts
git commit -m "feat(security): derive base URL from request headers for logout redirect"
```

---

### Task 3: Rate-limit на regenerate / useSharedAsIs / prematch

**Files:**
- Modify: `app/app/scenarios/[id]/actions.ts` (regenerateActivityAction, useSharedAsIsAction)
- Modify: `app/app/new/actions.ts` (prematchAction)

Контекст: `checkRateLimit({ key, subject, email, limit, windowMs })` из `@/lib/ratelimit` уже используется в `app/api/generate/stream/route.ts`. Whitelist `DEMO_USER_EMAILS` применяется внутри. Эти три точки сейчас НЕ лимитированы (LLM/спам без ограничения).

- [ ] **Step 1: Лимит в regenerateActivityAction**

В `app/app/scenarios/[id]/actions.ts` добавь импорт вверху:

```ts
import { checkRateLimit } from '@/lib/ratelimit'
```

Сразу после `const userId = session.user.id` в `regenerateActivityAction` (перед `loadOwned`):

```ts
  const rl = await checkRateLimit({
    key: 'regenerate',
    subject: userId,
    email: session.user.email,
    limit: Number(process.env.MAX_REGEN_PER_DAY ?? '40'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) {
    return { ok: false, error: 'Дневной лимит регенераций исчерпан. Попробуйте позже.' }
  }
```

- [ ] **Step 2: Лимит в useSharedAsIsAction**

Эта функция возвращает `Promise<void>` и редиректит. Добавь после `const userId = session.user.id`:

```ts
  const rl = await checkRateLimit({
    key: 'use-shared',
    subject: userId,
    email: session.user.email,
    limit: Number(process.env.MAX_COPY_PER_DAY ?? '50'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) redirect('/app/library?error=rate')
```

- [ ] **Step 3: Лимит в prematchAction**

В `app/app/new/actions.ts` добавь импорт `import { checkRateLimit } from '@/lib/ratelimit'`. После проверки `session?.user?.id` и до `generationInputSchema.safeParse`:

```ts
  const rl = await checkRateLimit({
    key: 'prematch',
    subject: session.user.id,
    email: session.user.email,
    limit: Number(process.env.MAX_PREMATCH_PER_DAY ?? '60'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return []
```

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run`
Expected: 173 pass / 3 skip (без регрессий)

- [ ] **Step 5: Документировать новые env-лимиты в `.env.example`**

Добавь строки в `.env.example` (рядом с существующими лимитами):

```
MAX_REGEN_PER_DAY=40
MAX_COPY_PER_DAY=50
MAX_PREMATCH_PER_DAY=60
```

- [ ] **Step 6: Коммит**

```bash
git add app/app/scenarios/[id]/actions.ts app/app/new/actions.ts .env.example
git commit -m "feat(security): rate-limit regenerate, use-shared and prematch actions"
```

---

### Task 4: Мягкий PII-warning при сохранении сценария (§6 п.2)

**Files:**
- Create: `lib/pii/scenario-scan.ts`
- Test: `tests/lib/pii/scenario-scan.test.ts`
- Modify: `app/app/scenarios/[id]/actions.ts` (saveScenarioAction)
- Modify: `app/app/scenarios/[id]/editor.tsx` (показ warning)

Контекст: `detectPII(text: string): PiiMatch[]` из `@/lib/pii`. `ScenarioContent` имеет `title`, `goals[]`, `materials[]`, `stages[].title`, `stages[].activities[].text`, `stages[].activities[].questions?[]`, `adaptations.{simpler,harder}`. Сохранение НЕ блокируем — только возвращаем человекочитаемый warning.

- [ ] **Step 1: Failing test**

```ts
// tests/lib/pii/scenario-scan.test.ts
import type { ScenarioContent } from '@/lib/scenario/schema'
import { scanScenarioPii } from '@/lib/pii/scenario-scan'
import { describe, expect, it } from 'vitest'

const base: ScenarioContent = {
  title: 'Дружба',
  goals: ['Развивать эмпатию'],
  materials: ['Карточки'],
  stages: [
    {
      kind: 'engage',
      title: 'Вступление',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Поговорим о дружбе' }],
    },
  ],
  adaptations: { simpler: 'Проще', harder: 'Сложнее' },
}

describe('scanScenarioPii', () => {
  it('возвращает null, когда ПДн нет', () => {
    expect(scanScenarioPii(base)).toBeNull()
  })
  it('находит телефон в тексте активности', () => {
    const c = structuredClone(base)
    c.stages[0].activities[0].text = 'Звоните +7 999 123-45-67'
    const r = scanScenarioPii(c)
    expect(r).not.toBeNull()
    expect(r?.kinds).toContain('phone')
  })
  it('находит email в вопросах', () => {
    const c = structuredClone(base)
    c.stages[0].activities[0].questions = ['Пишите на ivan@example.com']
    const r = scanScenarioPii(c)
    expect(r?.kinds).toContain('email')
  })
})
```

- [ ] **Step 2: Запуск — падает**

Run: `pnpm exec vitest run tests/lib/pii/scenario-scan.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация**

```ts
// lib/pii/scenario-scan.ts
import { detectPII } from '@/lib/pii'
import type { PiiType } from '@/lib/pii'
import type { ScenarioContent } from '@/lib/scenario/schema'

export type ScenarioPiiWarning = { kinds: PiiType[]; count: number }

/** Собирает весь текст сценария и мягко сканирует на ПДн. null — если чисто. */
export function scanScenarioPii(content: ScenarioContent): ScenarioPiiWarning | null {
  const parts: string[] = [content.title, ...content.goals, ...content.materials]
  for (const stage of content.stages) {
    parts.push(stage.title)
    for (const a of stage.activities) {
      parts.push(a.text)
      if (a.questions) parts.push(...a.questions)
    }
  }
  parts.push(content.adaptations.simpler, content.adaptations.harder)

  const matches = detectPII(parts.join('\n'))
  if (matches.length === 0) return null
  const kinds = Array.from(new Set(matches.map((m) => m.type)))
  return { kinds, count: matches.length }
}
```

- [ ] **Step 4: Запуск — проходит**

Run: `pnpm exec vitest run tests/lib/pii/scenario-scan.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Вернуть warning из saveScenarioAction**

В `app/app/scenarios/[id]/actions.ts`: импорт `import { scanScenarioPii } from '@/lib/pii/scenario-scan'`. Поменяй тип `SaveResult` и хвост `saveScenarioAction`:

```ts
export type SaveResult = { ok: true; piiWarning?: string } | { ok: false; error: string }
```

После успешной транзакции, перед `return`:

```ts
  const pii = scanScenarioPii(content)
  revalidatePath(`/app/scenarios/${scenarioId}`)
  if (pii) {
    return {
      ok: true,
      piiWarning: `Внимание: в тексте найдены возможные персональные данные (${pii.kinds.join(', ')}). Они сохранены как есть, но не попадут в библиотеку сообщества без обезличивания.`,
    }
  }
  return { ok: true }
```

(удали прежний одиночный `revalidatePath` + `return { ok: true }`)

- [ ] **Step 6: Показать warning в редакторе**

В `app/app/scenarios/[id]/editor.tsx` найди обработчик, который вызывает `saveScenarioAction(...)`. Сохрани результат и при `res.ok && res.piiWarning` положи текст в state, отрисуй неблокирующий баннер:

```tsx
{piiWarning && (
  <div className="rounded-md bg-warm-50 px-4 py-3 text-sm text-warm-700 ring-1 ring-warm-200">
    {piiWarning}
  </div>
)}
```

(Добавь `const [piiWarning, setPiiWarning] = useState<string | null>(null)` и `setPiiWarning(res.ok ? (res.piiWarning ?? null) : null)` после await save.)

- [ ] **Step 7: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run && pnpm build`
Expected: зелёное, тесты 176 pass / 3 skip

```bash
git add lib/pii/scenario-scan.ts tests/lib/pii/scenario-scan.test.ts app/app/scenarios/[id]/actions.ts app/app/scenarios/[id]/editor.tsx
git commit -m "feat(pii): soft PII warning on scenario save (non-blocking)"
```

---

## ОБЛАСТЬ B — Календарь поводов

### Task 5: Статический массив поводов `lib/calendar-events.ts`

**Files:**
- Create: `lib/calendar-events.ts`
- Test: `tests/lib/calendar-events.test.ts`

Контекст §8: ~25 дат `{date, title, suggested_direction, suggested_formats}`, БЕЗ LLM. `date` — `MM-DD` (без года, повторяется ежегодно). `suggested_direction` ∈ `DIRECTIONS` (`lib/scenario/options.ts`). `suggested_formats` ⊂ `FORMATS`.

- [ ] **Step 1: Failing test (инвариант данных)**

```ts
// tests/lib/calendar-events.test.ts
import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { DIRECTIONS, FORMATS } from '@/lib/scenario/options'
import { describe, expect, it } from 'vitest'

describe('CALENDAR_EVENTS', () => {
  it('содержит не менее 20 поводов', () => {
    expect(CALENDAR_EVENTS.length).toBeGreaterThanOrEqual(20)
  })
  it('даты в формате MM-DD и уникальны', () => {
    const seen = new Set<string>()
    for (const e of CALENDAR_EVENTS) {
      expect(e.date).toMatch(/^\d{2}-\d{2}$/)
      expect(seen.has(e.date)).toBe(false)
      seen.add(e.date)
    }
  })
  it('direction и formats валидны', () => {
    for (const e of CALENDAR_EVENTS) {
      expect(DIRECTIONS).toContain(e.suggested_direction)
      expect(e.suggested_formats.length).toBeGreaterThan(0)
      for (const f of e.suggested_formats) expect(FORMATS).toContain(f)
    }
  })
})
```

- [ ] **Step 2: Запуск — падает**

Run: `pnpm exec vitest run tests/lib/calendar-events.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация (≥20 реальных российских образовательных поводов)**

```ts
// lib/calendar-events.ts
import type { Direction, Format } from '@/lib/scenario/options'

export type CalendarOccasion = {
  date: string // MM-DD
  title: string
  suggested_direction: Direction
  suggested_formats: Format[]
}

export const CALENDAR_EVENTS: CalendarOccasion[] = [
  { date: '09-01', title: 'День знаний', suggested_direction: 'Познавательное', suggested_formats: ['классный час', 'беседа'] },
  { date: '09-03', title: 'День солидарности в борьбе с терроризмом', suggested_direction: 'Гражданское', suggested_formats: ['беседа', 'классный час'] },
  { date: '10-05', title: 'День учителя', suggested_direction: 'Духовно-нравственное', suggested_formats: ['классный час', 'мастерская'] },
  { date: '10-16', title: 'Всероссийский урок «Экология и энергосбережение»', suggested_direction: 'Экологическое', suggested_formats: ['квиз', 'беседа'] },
  { date: '11-04', title: 'День народного единства', suggested_direction: 'Патриотическое', suggested_formats: ['классный час', 'игра'] },
  { date: '11-16', title: 'Международный день толерантности', suggested_direction: 'Духовно-нравственное', suggested_formats: ['беседа', 'игра'] },
  { date: '11-26', title: 'День матери в России', suggested_direction: 'Духовно-нравственное', suggested_formats: ['классный час', 'мастерская'] },
  { date: '12-03', title: 'День неизвестного солдата', suggested_direction: 'Патриотическое', suggested_formats: ['беседа', 'классный час'] },
  { date: '12-09', title: 'День Героев Отечества', suggested_direction: 'Патриотическое', suggested_formats: ['классный час', 'беседа'] },
  { date: '12-12', title: 'День Конституции РФ', suggested_direction: 'Гражданское', suggested_formats: ['квиз', 'беседа'] },
  { date: '01-27', title: 'День снятия блокады Ленинграда', suggested_direction: 'Патриотическое', suggested_formats: ['беседа', 'классный час'] },
  { date: '02-08', title: 'День российской науки', suggested_direction: 'Познавательное', suggested_formats: ['квиз', 'мастерская'] },
  { date: '02-23', title: 'День защитника Отечества', suggested_direction: 'Патриотическое', suggested_formats: ['игра', 'классный час'] },
  { date: '03-08', title: 'Международный женский день', suggested_direction: 'Эстетическое', suggested_formats: ['мастерская', 'классный час'] },
  { date: '03-18', title: 'День воссоединения Крыма с Россией', suggested_direction: 'Патриотическое', suggested_formats: ['беседа', 'классный час'] },
  { date: '04-07', title: 'Всемирный день здоровья', suggested_direction: 'Физическое и здоровье', suggested_formats: ['игра', 'беседа'] },
  { date: '04-12', title: 'День космонавтики', suggested_direction: 'Познавательное', suggested_formats: ['квиз', 'игра'] },
  { date: '04-22', title: 'Международный день Земли', suggested_direction: 'Экологическое', suggested_formats: ['мастерская', 'беседа'] },
  { date: '05-01', title: 'Праздник Весны и Труда', suggested_direction: 'Трудовое', suggested_formats: ['беседа', 'мастерская'] },
  { date: '05-09', title: 'День Победы', suggested_direction: 'Патриотическое', suggested_formats: ['классный час', 'беседа'] },
  { date: '05-24', title: 'День славянской письменности и культуры', suggested_direction: 'Эстетическое', suggested_formats: ['беседа', 'квиз'] },
  { date: '06-01', title: 'Международный день защиты детей', suggested_direction: 'Гражданское', suggested_formats: ['игра', 'мастерская'] },
  { date: '06-12', title: 'День России', suggested_direction: 'Патриотическое', suggested_formats: ['классный час', 'квиз'] },
  { date: '06-22', title: 'День памяти и скорби', suggested_direction: 'Патриотическое', suggested_formats: ['беседа', 'классный час'] },
  { date: '10-30', title: 'Всероссийский урок безопасности в сети Интернет', suggested_direction: 'Познавательное', suggested_formats: ['беседа', 'квиз'] },
]
```

- [ ] **Step 4: Запуск — проходит**

Run: `pnpm exec vitest run tests/lib/calendar-events.test.ts`
Expected: PASS (3 tests, 25 поводов)

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`

```bash
git add lib/calendar-events.ts tests/lib/calendar-events.test.ts
git commit -m "feat(calendar): static occasions array (no LLM)"
```

---

### Task 6: Таблица `calendar_events` + миграция

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0008_*.sql` (через drizzle-kit generate)
- Test: `tests/smoke/calendar-schema.test.ts`

Контекст §4: `calendar_events` принадлежит пользователю (`users ──< calendar_events`), привязывает сценарий к дате. Паттерн id: `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`. FK с `onDelete: 'cascade'`.

- [ ] **Step 1: Добавить таблицу в `db/schema.ts`**

В конец файла (после `rateBuckets`), переиспользуя уже импортированные `pgTable/text/timestamp/index`:

```ts
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    eventDate: text('event_date').notNull(), // ISO YYYY-MM-DD
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byUserDate: index('calendar_events_user_date_idx').on(t.userId, t.eventDate),
  }),
)
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm exec drizzle-kit generate`
Expected: новый файл `db/migrations/0008_*.sql` с `CREATE TABLE "calendar_events"` + FK DO-блоки + индекс. Проверь содержимое (`WHERE`-изоляция обеспечивается в data-access, не в DDL).

- [ ] **Step 3: Применить миграцию к локальной БД**

Run: `pnpm db:up && pnpm db:migrate`
Expected: миграция применилась без ошибок.

- [ ] **Step 4: Smoke-тест (integration, живая БД через .env.local)**

```ts
// tests/smoke/calendar-schema.test.ts
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('calendar_events schema', () => {
  it('таблица существует', async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.calendar_events') IS NOT NULL AS ok`,
    )
    expect((r[0] as { ok: boolean }).ok).toBe(true)
  })
})
```

- [ ] **Step 5: Запуск + гейты**

Run: `pnpm exec vitest run tests/smoke/calendar-schema.test.ts && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS

- [ ] **Step 6: Коммит**

```bash
git add db/schema.ts db/migrations/ tests/smoke/calendar-schema.test.ts
git commit -m "feat(calendar): calendar_events table + migration"
```

---

### Task 7: Data-access слой с изоляцией по user_id

**Files:**
- Create: `lib/calendar/events.ts`
- Test: `tests/lib/calendar/events.test.ts` (юнит с инъекцией стаба БД — без живой сети)

Контекст: критерий жюри — никаких выборок пользовательских таблиц без `WHERE user_id = ?`. Делаем тонкий слой с инъекцией `db`-подобного объекта для тестируемости, либо тестируем чистый билдер условий. Берём подход «чистый билдер условия + тонкая обёртка»: тестируем, что условие всегда включает userId.

- [ ] **Step 1: Failing test**

```ts
// tests/lib/calendar/events.test.ts
import { describe, expect, it, vi } from 'vitest'
import { bindScenarioToDate, listUserEvents } from '@/lib/calendar/events'

function fakeDb() {
  const calls: { op: string; values?: unknown; where?: unknown }[] = []
  return {
    calls,
    insert() {
      return {
        values(v: unknown) {
          calls.push({ op: 'insert', values: v })
          return { returning: async () => [{ id: 'evt1' }] }
        },
      }
    },
    select() {
      return {
        from() {
          return {
            where(w: unknown) {
              calls.push({ op: 'select', where: w })
              return { orderBy: async () => [] }
            },
          }
        },
      }
    },
    delete() {
      return {
        where(w: unknown) {
          calls.push({ op: 'delete', where: w })
          return Promise.resolve()
        },
      }
    },
  }
}

describe('calendar events data-access', () => {
  it('bindScenarioToDate вставляет с userId/scenarioId/date', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    const id = await bindScenarioToDate(db as any, {
      userId: 'u1',
      scenarioId: 's1',
      eventDate: '2026-05-09',
      title: 'День Победы',
    })
    expect(id).toBe('evt1')
    const ins = db.calls.find((c) => c.op === 'insert')
    expect(ins?.values).toMatchObject({ userId: 'u1', scenarioId: 's1', eventDate: '2026-05-09' })
  })

  it('listUserEvents всегда фильтрует по userId (where передан)', async () => {
    const db = fakeDb()
    // biome-ignore lint/suspicious/noExplicitAny: тестовый стаб
    await listUserEvents(db as any, 'u1')
    const sel = db.calls.find((c) => c.op === 'select')
    expect(sel?.where).toBeDefined()
  })
})
```

- [ ] **Step 2: Запуск — падает**

Run: `pnpm exec vitest run tests/lib/calendar/events.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация**

```ts
// lib/calendar/events.ts
import { db as realDb } from '@/db'
import { calendarEvents } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'

type Db = typeof realDb

export type CalendarEventRow = {
  id: string
  scenarioId: string
  eventDate: string
  title: string
}

export async function bindScenarioToDate(
  db: Db,
  input: { userId: string; scenarioId: string; eventDate: string; title: string },
): Promise<string> {
  const [row] = await db
    .insert(calendarEvents)
    .values(input)
    .returning({ id: calendarEvents.id })
  return row.id
}

export async function listUserEvents(db: Db, userId: string): Promise<CalendarEventRow[]> {
  return db
    .select({
      id: calendarEvents.id,
      scenarioId: calendarEvents.scenarioId,
      eventDate: calendarEvents.eventDate,
      title: calendarEvents.title,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId))
    .orderBy(desc(calendarEvents.eventDate))
}

export async function unbindEvent(db: Db, userId: string, eventId: string): Promise<void> {
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)))
}
```

- [ ] **Step 4: Запуск — проходит**

Run: `pnpm exec vitest run tests/lib/calendar/events.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`

```bash
git add lib/calendar/events.ts tests/lib/calendar/events.test.ts
git commit -m "feat(calendar): user-isolated data-access for calendar_events"
```

---

### Task 8: Server actions календаря (bind/unbind)

**Files:**
- Create: `app/app/calendar/actions.ts`

Контекст: actions проверяют сессию и проксируют в data-access с `session.user.id` (изоляция). `unbind` использует `userId` в `WHERE`.

- [ ] **Step 1: Реализация**

```ts
// app/app/calendar/actions.ts
'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { bindScenarioToDate, unbindEvent } from '@/lib/calendar/events'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type BindResult = { ok: true } | { ok: false; error: string }

export async function bindScenarioAction(
  scenarioId: string,
  eventDate: string,
): Promise<BindResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return { ok: false, error: 'Некорректная дата' }
  }

  // проверяем владение сценарием (изоляция)
  const [owned] = await db
    .select({ id: scenarios.id, title: scenarios.title })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  await bindScenarioToDate(db, { userId, scenarioId, eventDate, title: owned.title })
  revalidatePath('/app/calendar')
  return { ok: true }
}

export async function unbindEventAction(eventId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  await unbindEvent(db, session.user.id, eventId)
  revalidatePath('/app/calendar')
}
```

- [ ] **Step 2: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run`
Expected: без регрессий

```bash
git add app/app/calendar/actions.ts
git commit -m "feat(calendar): bind/unbind server actions with user isolation"
```

---

### Task 9: Страница `/app/calendar` + сетка месяца

**Files:**
- Create: `app/app/calendar/page.tsx` (server component)
- Create: `components/calendar/CalendarGrid.tsx` (client)

Контекст: страница загружает поводы (`CALENDAR_EVENTS`) + привязки пользователя (`listUserEvents`), рендерит месячную сетку. Стиль — карточки `ring-1 shadow-card`, бейджи направлений (как в `design_example`). UI на русском.

- [ ] **Step 1: Страница (server)**

```tsx
// app/app/calendar/page.tsx
import { auth } from '@/auth'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { db } from '@/db'
import { CALENDAR_EVENTS } from '@/lib/calendar-events'
import { listUserEvents } from '@/lib/calendar/events'
import { redirect } from 'next/navigation'

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userEvents = await listUserEvents(db, session.user.id)
  return (
    <div>
      <h1 className="mb-2 text-3xl font-semibold text-neutral-900">Календарь поводов</h1>
      <p className="mb-6 text-neutral-600">
        Памятные даты учебного года. Выберите повод, чтобы создать сценарий, или посмотрите
        привязанные занятия.
      </p>
      <CalendarGrid occasions={CALENDAR_EVENTS} userEvents={userEvents} />
    </div>
  )
}
```

- [ ] **Step 2: Сетка (client)** — сгруппировать поводы по месяцу (из `MM-DD`), карточка повода ведёт на `/app/new?topic=<title>&calendarDate=<MM-DD>`; привязанные сценарии (`userEvents`, дата `YYYY-MM-DD`) показать ссылкой на `/app/scenarios/[id]` с кнопкой удаления (вызывает `unbindEventAction`).

```tsx
// components/calendar/CalendarGrid.tsx
'use client'

import { unbindEventAction } from '@/app/app/calendar/actions'
import type { CalendarEventRow } from '@/lib/calendar/events'
import type { CalendarOccasion } from '@/lib/calendar-events'
import Link from 'next/link'
import { useTransition } from 'react'

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function monthOf(mmdd: string) {
  return Number(mmdd.slice(0, 2)) - 1
}

export function CalendarGrid({
  occasions,
  userEvents,
}: {
  occasions: CalendarOccasion[]
  userEvents: CalendarEventRow[]
}) {
  const [pending, start] = useTransition()
  // учебный год: сентябрь(8) … август(7)
  const order = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]
  const byMonth = new Map<number, CalendarOccasion[]>()
  for (const o of occasions) {
    const m = monthOf(o.date)
    byMonth.set(m, [...(byMonth.get(m) ?? []), o])
  }

  return (
    <div className="space-y-8">
      {userEvents.length > 0 && (
        <section className="rounded-lg bg-brand-50 p-4 ring-1 ring-brand-200">
          <h2 className="mb-3 font-display text-lg font-semibold text-neutral-900">
            Ваши занятия на датах
          </h2>
          <ul className="space-y-2">
            {userEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/app/scenarios/${e.scenarioId}`} className="text-brand-700 hover:underline">
                  {e.eventDate} — {e.title}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => unbindEventAction(e.id))}
                  className="text-neutral-400 hover:text-error"
                >
                  убрать
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {order
          .filter((m) => byMonth.has(m))
          .map((m) => (
            <div key={m} className="rounded-lg bg-neutral-0 p-4 shadow-card ring-1 ring-neutral-200">
              <h3 className="mb-3 font-display font-semibold text-neutral-900">{MONTHS[m]}</h3>
              <ul className="space-y-3">
                {(byMonth.get(m) ?? []).map((o) => (
                  <li key={o.date}>
                    <Link
                      href={`/app/new?topic=${encodeURIComponent(o.title)}&calendarDate=${o.date}`}
                      className="block rounded-md px-2 py-1.5 hover:bg-brand-50"
                    >
                      <span className="text-sm font-medium text-neutral-900">{o.title}</span>
                      <span className="mt-1 block text-xs text-neutral-500">
                        {o.date.slice(3)}.{o.date.slice(0, 2)} · {o.suggested_direction}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: страница билдится

```bash
git add app/app/calendar/page.tsx components/calendar/CalendarGrid.tsx
git commit -m "feat(calendar): /app/calendar month grid with occasions and user bindings"
```

---

### Task 10: Кнопка «На дату» в редакторе

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx`

Контекст §8 Step 4 toolbar: «На дату». Минимальный UX: input типа `date` + кнопка, вызывает `bindScenarioAction(scenarioId, date)`; при успехе — тост/баннер «Привязано к календарю».

- [ ] **Step 1: Добавить в toolbar редактора**

Импорт: `import { bindScenarioAction } from '@/app/app/calendar/actions'`. Рядом с кнопками Лайк/PDF/DOCX добавь:

```tsx
<form
  className="flex items-center gap-2"
  action={async (fd: FormData) => {
    const date = String(fd.get('eventDate') ?? '')
    if (!date) return
    const res = await bindScenarioAction(scenarioId, date)
    setPiiWarning(null)
    setCalNote(res.ok ? 'Сценарий привязан к календарю' : res.error)
  }}
>
  <input
    type="date"
    name="eventDate"
    className="h-9 rounded-md px-2 text-sm ring-1 ring-neutral-200"
  />
  <Button type="submit" variant="outline" size="sm">На дату</Button>
</form>
{calNote && <span className="text-sm text-brand-700">{calNote}</span>}
```

Добавь `const [calNote, setCalNote] = useState<string | null>(null)`. `scenarioId` уже доступен в редакторе (проверь проп/параметр; если редактор получает только `content`, передай `scenarioId` пропом из `page.tsx`).

- [ ] **Step 2: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`

```bash
git add app/app/scenarios/[id]/editor.tsx
git commit -m "feat(calendar): bind scenario to date from editor toolbar"
```

---

### Task 11: 3-й источник темы «Календарь поводов» в `/app/new`

**Files:**
- Modify: `app/app/new/page.tsx`
- Modify: `components/nav/AppNavbar.tsx` (ссылка «Календарь»)

Контекст §8 Step 1: табы источника темы («Из плана» / «Вручную» / «Календарь поводов»). Сейчас формы-табов нет — тема свободным вводом, опционально `planTopicId` из query. Календарь уже передаёт `?topic=&calendarDate=` (Task 9). Минимальная интеграция БЕЗ полного редизайна формы: добавить переключатель табов над полем «Тема», вкладка «Календарь поводов» показывает `<select>` со списком `CALENDAR_EVENTS`, выбор подставляет title в поле topic и фиксирует direction/format рекомендации.

- [ ] **Step 1: Табы источника в форме**

В `app/app/new/page.tsx` добавь импорт `import { CALENDAR_EVENTS } from '@/lib/calendar-events'` и state:

```tsx
const calendarDate = sp.get('calendarDate') ?? ''
const [source, setSource] = useState<'manual' | 'calendar'>(calendarDate ? 'calendar' : 'manual')
const [topicValue, setTopicValue] = useState(topic)
```

Над блоком «Тема» вставь переключатель (chip-табы в стиле `ring-1`):

```tsx
<div className="flex gap-2">
  {([['manual', 'Вручную'], ['calendar', 'Календарь поводов']] as const).map(([v, label]) => (
    <button
      key={v}
      type="button"
      onClick={() => setSource(v)}
      className={`rounded-full px-3 py-1 text-sm ring-1 transition ${
        source === v
          ? 'bg-brand-500 text-white ring-brand-500'
          : 'bg-neutral-0 text-neutral-600 ring-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {label}
    </button>
  ))}
</div>
```

Когда `source === 'calendar'` — отрисуй `<select>` поводов; `onChange` подставляет title в `topicValue`:

```tsx
{source === 'calendar' && (
  <div className="space-y-1.5">
    <Label htmlFor="occasion">Повод</Label>
    <select
      id="occasion"
      className={selectClass}
      defaultValue={CALENDAR_EVENTS.find((e) => e.date === calendarDate)?.title ?? ''}
      onChange={(e) => setTopicValue(e.target.value)}
    >
      <option value="">— выберите повод —</option>
      {CALENDAR_EVENTS.map((o) => (
        <option key={o.date} value={o.title}>{o.title}</option>
      ))}
    </select>
  </div>
)}
```

Поле «Тема» сделай управляемым: `value={topicValue} onChange={(e) => setTopicValue(e.target.value)}` (вместо `defaultValue`). Это держит источники синхронными.

> Примечание: «Из плана» уже работает через query-param `planTopicId` (приходит со страницы планов) — отдельную вкладку «Из плана» в этом minimal-варианте не добавляем, т.к. UX уже покрыт переходом со страницы планов. Если требуется явная вкладка — это отдельная задача backlog; зафиксировать в `docs/qa.md`.

- [ ] **Step 2: Ссылка «Календарь» в навбаре**

В `components/nav/AppNavbar.tsx` после ссылки «Планы»:

```tsx
<Link href="/app/calendar" className="hover:text-neutral-900">Календарь</Link>
```

- [ ] **Step 3: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`

```bash
git add app/app/new/page.tsx components/nav/AppNavbar.tsx
git commit -m "feat(calendar): occasion source tab in /app/new + navbar link"
```

---

## ОБЛАСТЬ C — Лендинг

### Task 12: Публичный лендинг `app/page.tsx` из `design_example`

**Files:**
- Modify: `app/page.tsx` (перезапись)
- Create: `components/landing/LandingNavbar.tsx`, `Hero.tsx`, `Features.tsx`, `HowItWorks.tsx`, `Audience.tsx`, `Cta.tsx`, `Footer.tsx`

Контекст §8: `/` — лендинг, адаптированный из `design_example/` (sticky navbar с backdrop-blur, hero, feature-карточки `ring-1 shadow-card`, how-it-works, audience-бейджи, CTA, footer). Токены brand/neutral/accent/warm + Inter/Onest УЖЕ в `tailwind.config.ts` проекта. Контент строго про «Классный час» (ИИ-генератор сценариев внеурочки), на русском. CTA ведут на `/register` и `/login`.

**ВАЖНО:** сверяйся с реальными файлами `design_example/components/*` (Navbar, HeroSection, FeaturesGrid, HowItWorks, AudienceSection, CtaSection, Footer) — копируй структуру/классы/тени/радиусы, но переписывай тексты под наш продукт. НЕ импортируй из `design_example` (untracked, вне сборки) и НЕ делай `git add design_example`.

- [ ] **Step 1: Прочитать эталон**

Прочитай `design_example/app/page.tsx` и каждый `design_example/components/*.tsx`. Зафиксируй: классы sticky-navbar, hero-сетку, паттерн карточки фичи, footer-колонки.

- [ ] **Step 2: Создать секции в `components/landing/`**

Адаптируй 7 секций под продукт. Контент-ориентиры:
- **Hero:** h1 «Сценарий классного часа за 30 секунд», подзаголовок про RAG-методички + лайки сообщества + безопасность ПДн, CTA «Начать бесплатно» → `/register`, «Войти» → `/login`.
- **Features (4 карточки):** «Генерация по методичкам (Разговоры о важном)», «Двухэтапный стрим: структура → детали», «Локальная защита ПДн», «Экспорт в PDF и DOCX».
- **HowItWorks (3 шага):** «Задайте контекст» → «ИИ генерирует с опорой на методички» → «Отредактируйте и экспортируйте».
- **Audience (бейджи):** Классные руководители · Советники по воспитанию · Педагоги-организаторы.
- **Cta:** финальный призыв + кнопка «Создать первый сценарий» → `/register`.
- **Footer:** бренд «Классный час», краткое описание, год.

Все компоненты — server components (без `'use client'`), кроме мобильного меню navbar при необходимости.

- [ ] **Step 3: Собрать страницу**

```tsx
// app/page.tsx
import { Audience } from '@/components/landing/Audience'
import { Cta } from '@/components/landing/Cta'
import { Features } from '@/components/landing/Features'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingNavbar } from '@/components/landing/LandingNavbar'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <LandingNavbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Audience />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 4: Визуальная проверка (dev server)**

Run: `pnpm dev` → открыть `http://localhost:3000/` в браузере. Проверить: sticky navbar с blur, hero, карточки с тенями, адаптив (mobile/desktop), кнопки ведут на `/register` и `/login`, всё на русском, палитра совпадает с `design_example`.

- [ ] **Step 5: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`

```bash
git add app/page.tsx components/landing/
git commit -m "feat(landing): public landing adapted from design_example"
```

---

## ОБЛАСТЬ D — Демо-prep

### Task 13: Скрипт калибровки `SIMILARITY_THRESHOLD`

**Files:**
- Create: `scripts/calibrate-threshold.ts`

Контекст §7: прогнать на ≥20 запросах, построить распределение similarity и вывести рекомендацию по `SIMILARITY_THRESHOLD` (default 0.78). Скрипт — РУЧНОЙ прогон (ходит в GigaChat + БД), НЕ в CI, НЕ покрывается юнит-тестом (живая сеть). Переиспользует `prematchShared`/`embed`.

- [ ] **Step 1: Реализация**

```ts
// scripts/calibrate-threshold.ts
import 'dotenv/config'
import { embed } from '@/lib/gigachat/embeddings'
import { db } from '@/db'
import { sharedScenarios } from '@/db/schema'
import { sql } from 'drizzle-orm'

// ≥20 типовых запросов
const QUERIES = [
  'Гражданское 5 Дружба и взаимопомощь',
  'Патриотическое 7 День Победы',
  // … добавить до 20+ строк "направление класс тема"
]

async function main() {
  const sims: number[] = []
  for (const q of QUERIES) {
    const [vec] = await embed([q])
    if (!vec) continue
    const lit = `[${vec.join(',')}]`
    const rows = await db.execute<{ sim: number }>(
      sql`SELECT 1 - (embedding <=> ${lit}::vector) AS sim
          FROM ${sharedScenarios}
          WHERE embedding IS NOT NULL
          ORDER BY sim DESC LIMIT 1`,
    )
    const top = (rows[0] as { sim: number } | undefined)?.sim
    if (typeof top === 'number') sims.push(top)
    console.log(`${q} → top sim ${top?.toFixed(3) ?? 'n/a'}`)
  }
  sims.sort((a, b) => a - b)
  const p = (q: number) => sims[Math.floor(sims.length * q)] ?? 0
  console.log('\n=== Распределение top-sim ===')
  console.log(`n=${sims.length} min=${sims[0]?.toFixed(3)} p25=${p(0.25)?.toFixed(3)} median=${p(0.5)?.toFixed(3)} p75=${p(0.75)?.toFixed(3)} max=${sims.at(-1)?.toFixed(3)}`)
  console.log('Рекомендация SIMILARITY_THRESHOLD ≈ медиана между релевантными и нерелевантными (вручную оценить вывод выше).')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Добавить npm-скрипт в `package.json`**

В `"scripts"`: `"calibrate": "tsx scripts/calibrate-threshold.ts"`

- [ ] **Step 3: Гейты (tsc/lint; НЕ запускать live)**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: компилируется (живой прогон — ручной шаг в `docs/qa.md`)

- [ ] **Step 4: Коммит**

```bash
git add scripts/calibrate-threshold.ts package.json
git commit -m "feat(demo): SIMILARITY_THRESHOLD calibration script (manual run)"
```

---

### Task 14: Seed демо-аккаунта и примеров

**Files:**
- Create: `scripts/seed-demo.ts`

Контекст: для демо нужен предзаполненный аккаунт (email из `DEMO_USER_EMAILS`, без rate-limit) + несколько примеров сценариев/shared. Скрипт идемпотентный, ручной прогон. Переиспользует `hashPassword` (`lib/auth/password`), `db`, схему.

- [ ] **Step 1: Реализация**

```ts
// scripts/seed-demo.ts
import 'dotenv/config'
import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { eq } from 'drizzle-orm'

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@klassniychas.ru'
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo12345'

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1)
  if (existing) {
    console.log(`Демо-аккаунт уже существует: ${DEMO_EMAIL} (id=${existing.id})`)
    process.exit(0)
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: 'Демо-педагог', passwordHash })
    .returning({ id: users.id })
  console.log(`Создан демо-аккаунт: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (id=${user.id})`)
  console.log(`Добавь ${DEMO_EMAIL} в DEMO_USER_EMAILS в .env.local, чтобы снять лимиты.`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: npm-скрипт**

В `package.json` `"scripts"`: `"seed:demo": "tsx scripts/seed-demo.ts"`

- [ ] **Step 3: Гейты + коммит**

Run: `pnpm exec tsc --noEmit && pnpm lint`

```bash
git add scripts/seed-demo.ts package.json
git commit -m "feat(demo): idempotent demo-account seed script"
```

---

### Task 15: UAT чек-лист `docs/qa.md`

**Files:**
- Create: `docs/qa.md`

Контекст §10/§12: ручной E2E чек-лист + ручные шаги, требующие живого окружения (калибровка, проверка словаря `russian` в Docker-Postgres). НЕ код.

- [ ] **Step 1: Написать `docs/qa.md`**

Структура:
```markdown
# QA / UAT чек-лист (перед демо)

## 0. Подготовка окружения
- [ ] `.env.local` с реальным GIGACHAT_AUTH_KEY (base64 client_id:client_secret), GIGACHAT_SCOPE=GIGACHAT_API_PERS
- [ ] `pnpm db:up && pnpm db:migrate` (включая 0008_calendar_events)
- [ ] `pnpm seed:demo` → демо-аккаунт; добавить email в DEMO_USER_EMAILS
- [ ] `pnpm exec tsx scripts/ingest-razgovor.ts` (RAG-корпус методичек) + ingest-seed

## 1. Ручные проверки окружения
- [ ] **Словарь `russian` в to_tsvector:** в psql выполнить
      `SELECT to_tsvector('russian', 'дружба и взаимопомощь');`
      Если ошибка — выставить `PG_TSV_LANG=simple` в .env.local и перепроверить гибридный поиск.
- [ ] **Калибровка порога:** `pnpm calibrate` на ≥20 запросах → оценить распределение → выставить SIMILARITY_THRESHOLD.

## 2. E2E (golden path)
- [ ] Регистрация нового пользователя → редирект в /app
- [ ] /app/new: задать контекст → «Подобрать похожие» → «Сгенерировать новый»
- [ ] Стрим: скелет → детали без ошибок, прогресс-бар
- [ ] Редактор: правка блока, кнопки ↑/↓, «🎲 заменить активность», auto-save
- [ ] PII-warning: вставить телефон в активность, сохранить → виден неблокирующий warning
- [ ] Лайк + opt-in shared → повторный PII-чек (если есть ПДн — блок)
- [ ] Экспорт PDF и DOCX — файлы открываются, кириллица корректна
- [ ] Календарь: /app/calendar показывает поводы; «На дату» из редактора → запись видна
- [ ] 3-й источник темы: /app/new вкладка «Календарь поводов» подставляет тему
- [ ] Лендинг /: sticky navbar, hero, карточки, CTA на /register и /login

## 3. Изоляция данных (jury-критерий)
- [ ] Под пользователем A создать сценарий + привязку к дате
- [ ] Под пользователем B: /app, /app/calendar, /app/library — данные A НЕ видны

## 4. Лимиты
- [ ] Не-whitelist пользователь: >10 генераций/день → 429 с понятным сообщением
- [ ] Демо-аккаунт (в DEMO_USER_EMAILS): лимиты не срабатывают

## 5. Security
- [ ] Logout с чужого origin → 403 (curl с подменённым Origin)
- [ ] `pnpm exec playwright test` (manual, не CI) — если e2e настроены

## Известные backlog-пункты (не блокируют демо)
- Явная вкладка «Из плана» в /app/new (сейчас через переход со страницы планов)
- Drag-handle перемещение блоков (есть ↑/↓)
```

- [ ] **Step 2: Коммит**

```bash
git add docs/qa.md
git commit -m "docs(demo): UAT checklist and pre-demo manual steps"
```

---

## ОБЛАСТЬ E — Финализация

### Task 16: Холистическое ревью + security-review + статус + тег

**Files:**
- Modify: `CLAUDE.md` (раздел «Статус реализации»)

- [ ] **Step 1: Полные гейты по всей ветке**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run && pnpm build`
Expected: tsc/lint/build зелёные; vitest ~182+ pass / 3 skip (baseline 173 + новые тесты Tasks 1,2,4,5,7)

- [ ] **Step 2: Холистическое code-review** (subagent-driven финальный проход) — связность областей A–D, изоляция `calendar_events` по `user_id` во ВСЕХ путях, отсутствие raw SQL без user_id для пользовательских таблиц, отсутствие утечки `design_example` в коммиты.

- [ ] **Step 3: `security-review`** по всей ветке (skill `security-review`). Зафиксировать находки; HIGH — починить, остальное — в `docs/qa.md`.

- [ ] **Step 4: Обновить «Статус реализации» в `CLAUDE.md`** — добавить «Plan 9 Demo-readiness — ГОТОВ», что реализовано (календарь+таблица+изоляция, лендинг, security/PII-polish, скрипты калибровки/seed, docs/qa.md), оставшиеся РУЧНЫЕ шаги перед демо (калибровка на живом GigaChat, проверка `russian` tsv в Docker, скринкаст, презентация — вне scope кода).

- [ ] **Step 5: Финальный коммит + тег**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): Plan 9 demo-readiness done status"
git tag demo-readiness-done
```

---

## Self-Review (соответствие спеке)

**Spec coverage:**
- §12 «Привязка сценария к дате» → Tasks 6–10 ✓
- §12 «Лендинг и стиль из design_example» → Task 12 ✓
- §12 «Калибровка SIMILARITY_THRESHOLD» → Task 13 (скрипт) + Task 15 (ручной прогон) ✓
- §12 «russian tsv проверен в Docker» → Task 15 ручной шаг ✓
- §6 п.2 «Сохранение сценария — мягкий PII warning» → Task 4 ✓
- §8 «3 источника темы» → Task 11 (manual + calendar; «из плана» через query, backlog-вкладка зафиксирована) ✓
- §9 CSRF/origin + rate-limit техдолг → Tasks 1–3 ✓
- §12 «Скринкаст / презентация» → вне scope кода, зафиксировано в статусе ✓

**Placeholder scan:** в `lib/calendar-events.ts` массив полный (25 поводов); в `scripts/calibrate-threshold.ts` `QUERIES` помечен «добавить до 20+» — это РУЧНОЙ ввод данных для прогона, не код-плейсхолдер (минимум 2 примера даны как образец формата).

**Type consistency:** `isSameOrigin`/`assertSameOrigin`, `baseUrlFrom`/`baseUrlFromRequest`, `scanScenarioPii→ScenarioPiiWarning`, `bindScenarioToDate/listUserEvents/unbindEvent`, `bindScenarioAction/unbindEventAction`, `CalendarOccasion/CalendarEventRow` — имена согласованы между задачами.
