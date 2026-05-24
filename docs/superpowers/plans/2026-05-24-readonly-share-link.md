# Read-only шаринг сценария по ссылке (#30а) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец сценария может включить неугадываемую публичную read-only ссылку `/s/<token>`; по ней любой без входа смотрит сценарий, скачивает PDF/DOCX, видит CTA на регистрацию; залогиненный может скопировать сценарий себе.

**Architecture:** Колонка `scenarios.share_token` (nullable unique). Включение/отзыв — server actions с мягким PII-предупреждением. Публичная страница `app/s/[token]` (вне `/app`, middleware не гейтит) рендерит контент через переиспользуемый `lib/export/document-model`. Публичный экспорт по токену зеркалит приватный. Без новых таблиц.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle (миграция через `pnpm db:generate`), Vitest, Biome.

**Спека:** `docs/superpowers/specs/2026-05-24-readonly-share-link-design.md`

**Конвенции:** один коммит на задачу; TDD для чистой логики; перед коммитом — `pnpm test && pnpm lint && pnpm exec tsc --noEmit`; финал — `pnpm build`. Biome в тестах требует `@/...` импорты ВЫШЕ внешних (`vitest`).

---

### Task 1: Колонка `share_token` в схеме + миграция

**Files:**
- Modify: `db/schema.ts` (таблица `scenarios`, рядом с `sourceSharedId`)
- Create: `db/migrations/0012_*.sql` (генерируется drizzle-kit)

- [ ] **Step 1: Добавить колонку в схему**

В `db/schema.ts`, в `export const scenarios = pgTable('scenarios', { ... })`, добавить поле после `sourceSharedId`:

```ts
  shareToken: text('share_token').unique(),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: создан файл `db/migrations/0012_*.sql`, содержащий `ALTER TABLE "scenarios" ADD COLUMN "share_token" text;` и unique-constraint. Проверь содержимое:
Run: `cat db/migrations/0012_*.sql`

- [ ] **Step 3: Применить миграцию к dev-БД и проверить tsc**

Run: `pnpm db:migrate && pnpm exec tsc --noEmit`
Expected: миграция применяется без ошибок (идемпотентно), tsc чист.
(Если БД недоступна в среде — пропустить миграцию, но tsc обязателен; отметить в отчёте.)

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "feat(share): колонка scenarios.share_token + миграция 0012 (#30)"
```

---

### Task 2: Генератор токена `lib/share/token.ts`

**Files:**
- Create: `lib/share/token.ts`
- Test: `tests/lib/share/token.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// tests/lib/share/token.test.ts
import { generateShareToken } from '@/lib/share/token'
import { describe, expect, it } from 'vitest'

describe('generateShareToken', () => {
  it('возвращает url-safe строку достаточной длины', () => {
    const t = generateShareToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/) // base64url-алфавит, без +/=
    expect(t.length).toBeGreaterThanOrEqual(22) // ~24 байта → ≥128 бит
  })

  it('генерирует разные токены', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateShareToken()))
    expect(set.size).toBe(100)
  })
})
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm exec vitest run tests/lib/share/token.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// lib/share/token.ts
import { randomBytes } from 'node:crypto'

// Неугадываемый url-safe токен (24 байта ≈ 192 бита энтропии).
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url')
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `pnpm exec vitest run tests/lib/share/token.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add lib/share/token.ts tests/lib/share/token.test.ts
git commit -m "feat(share): генератор неугадываемого share-токена (#30)"
```

---

### Task 3: Server actions включения/отзыва ссылки

**Files:**
- Modify: `app/app/scenarios/[id]/actions.ts` (добавить две функции в конец)

Контекст: файл уже `'use server'`, импортирует `auth`, `db`, `scenarios`, `and`/`eq`. Есть `scanScenarioPii` в `@/lib/pii/scenario-scan` (`scanScenarioPii(content) → { kinds, count } | null`). Изоляция по `user_id` обязательна на load И update (паттерн `saveScenarioAction`).

- [ ] **Step 1: Добавить импорты (если отсутствуют) и actions**

Убедись, что вверху есть `import { scanScenarioPii, type ScenarioPiiWarning } from '@/lib/pii/scenario-scan'` и `import { generateShareToken } from '@/lib/share/token'`. Затем добавить в конец файла:

```ts
export type EnableShareResult =
  | { ok: true; token: string; piiWarning: ScenarioPiiWarning | null }
  | { ok: false; error: string }

export async function enableShareLinkAction(scenarioId: string): Promise<EnableShareResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано' }
  const userId = session.user.id

  const [row] = await db
    .select({ shareToken: scenarios.shareToken, content: scenarios.content })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  if (!row) return { ok: false, error: 'Сценарий не найден' }

  let token = row.shareToken
  if (!token) {
    token = generateShareToken()
    await db
      .update(scenarios)
      .set({ shareToken: token })
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
  }

  const piiWarning = scanScenarioPii(row.content)
  return { ok: true, token, piiWarning }
}

export async function disableShareLinkAction(
  scenarioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Не авторизовано' }
  await db
    .update(scenarios)
    .set({ shareToken: null })
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, session.user.id)))
  return { ok: true }
}
```

- [ ] **Step 2: Проверить**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: чисто. (Проверь, что `ScenarioPiiWarning` действительно экспортируется из `lib/pii/scenario-scan.ts` — он экспортирует `type ScenarioPiiWarning`. Если имя иное — поправь импорт.)

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/[id]/actions.ts
git commit -m "feat(share): enable/disable share-link actions с PII-предупреждением (#30)"
```

---

### Task 4: Read-only рендер `components/share/ScenarioReadOnly.tsx`

**Files:**
- Create: `components/share/ScenarioReadOnly.tsx`

Контекст: `buildScenarioDocument(content, meta): DocBlock[]` из `@/lib/export/document-model`. `DocBlock` = `{type:'heading';level:1|2;text} | {type:'paragraph';text} | {type:'bullets';items:string[]} | {type:'metaTable';rows:{label,value}[]}`. Компонент серверный (без `'use client'`), принимает уже построенные блоки.

**Без юнит-теста:** в проекте НЕТ `@testing-library/react`, vitest-окружение `node` — презентационные компоненты здесь не юнит-тестируются (паттерн проекта), корректность проверяется `tsc` + `pnpm build`. Это чистый presentational-маппинг `DocBlock[]` → JSX, без логики.

- [ ] **Step 1: Реализация**

```tsx
// components/share/ScenarioReadOnly.tsx
import type { DocBlock } from '@/lib/export/document-model'

export function ScenarioReadOnly({ blocks }: { blocks: DocBlock[] }) {
  return (
    <article className="space-y-4">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return b.level === 1 ? (
            <h1 key={i} className="text-2xl font-semibold text-neutral-900">
              {b.text}
            </h1>
          ) : (
            <h2 key={i} className="mt-6 text-xl font-semibold text-neutral-800">
              {b.text}
            </h2>
          )
        }
        if (b.type === 'paragraph') {
          return (
            <p key={i} className="whitespace-pre-wrap leading-relaxed text-neutral-700">
              {b.text}
            </p>
          )
        }
        if (b.type === 'bullets') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6 text-neutral-700">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          )
        }
        // metaTable
        return (
          <div key={i} className="flex flex-wrap gap-2">
            {b.rows.map((r, j) => (
              <span
                key={j}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 ring-1 ring-brand-200"
              >
                {r.label}: {r.value}
              </span>
            ))}
          </div>
        )
      })}
    </article>
  )
}
```

- [ ] **Step 2: Проверить**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: чисто.

- [ ] **Step 3: Commit**

```bash
git add components/share/ScenarioReadOnly.tsx
git commit -m "feat(share): read-only рендер блоков сценария (#30)"
```

---

### Task 5: «Скопировать себе» — `copyScenarioByTokenAction`

**Files:**
- Modify: `app/app/scenarios/[id]/actions.ts` (добавить функцию)

Контекст: схема `scenarios` имеет поля `userId, title, direction, grade, durationMin, format, topic, content, inputContext, generationMeta` (+ опц. источники). `redirect` уже импортирован. Копия создаётся под текущим пользователем, `share_token` НЕ наследуется (остаётся null по умолчанию). Зеркалит вставку из `save`-замыкания стрим-роута.

- [ ] **Step 1: Добавить action**

Убедись, что есть импорт `import { scenarioVersions } from '@/db/schema'` (он уже импортируется в этом файле). Добавить:

```ts
export async function copyScenarioByTokenAction(token: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [src] = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.shareToken, token))
    .limit(1)
  if (!src) redirect('/app')

  const [copy] = await db
    .insert(scenarios)
    .values({
      userId,
      title: src.title,
      direction: src.direction,
      grade: src.grade,
      durationMin: src.durationMin,
      format: src.format,
      topic: src.topic,
      content: src.content,
      inputContext: src.inputContext,
      generationMeta: src.generationMeta,
    })
    .returning({ id: scenarios.id })

  await db.insert(scenarioVersions).values({ scenarioId: copy.id, content: src.content })
  redirect(`/app/scenarios/${copy.id}`)
}
```

- [ ] **Step 2: Проверить**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: чисто. (`eq` уже импортирован; если нет — добавить из `drizzle-orm`.)

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/[id]/actions.ts
git commit -m "feat(share): copyScenarioByTokenAction — копия расшаренного себе (#30)"
```

---

### Task 6: Публичная страница `app/s/[token]/page.tsx`

**Files:**
- Create: `app/s/[token]/page.tsx`
- Create: `components/share/CopyToMyAccount.tsx` (клиентская кнопка)

Контекст: middleware гейтит только `/app/:path*` → `/s/...` публична. `buildScenarioDocument(content, meta)` строит блоки. `auth()` доступен в server-компоненте. Лого `/logo.svg` в `public/`.

- [ ] **Step 1: Клиентская кнопка копирования**

```tsx
// components/share/CopyToMyAccount.tsx
'use client'

import { Button } from '@/components/ui/button'
import { copyScenarioByTokenAction } from '@/app/app/scenarios/[id]/actions'
import { useTransition } from 'react'

export function CopyToMyAccount({ token }: { token: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await copyScenarioByTokenAction(token) })}
    >
      {pending ? 'Копируем…' : 'Скопировать себе'}
    </Button>
  )
}
```

- [ ] **Step 2: Публичная страница**

```tsx
// app/s/[token]/page.tsx
import { CopyToMyAccount } from '@/components/share/CopyToMyAccount'
import { ScenarioReadOnly } from '@/components/share/ScenarioReadOnly'
import { Button } from '@/components/ui/button'
import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { buildScenarioDocument } from '@/lib/export/document-model'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

async function loadByToken(token: string) {
  const [row] = await db.select().from(scenarios).where(eq(scenarios.shareToken, token)).limit(1)
  return row ?? null
}

export async function generateMetadata({
  params,
}: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const row = await loadByToken(token)
  return { title: row ? `${row.content.title} — Planwise` : 'Сценарий — Planwise' }
}

export default async function SharedScenarioPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await loadByToken(token)
  if (!row) notFound()

  const blocks = buildScenarioDocument(row.content, {
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

  const session = await auth()

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-0 px-6 py-3">
        <Link href="/" className="flex items-center" aria-label="Planwise">
          <Image src="/logo.svg" alt="Planwise — Классный час" width={150} height={36} priority />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/register">Создать свой сценарий</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/share/${token}/export?format=pdf`}>Скачать PDF</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/share/${token}/export?format=docx`}>Скачать DOCX</a>
          </Button>
          {session?.user?.id && <CopyToMyAccount token={token} />}
        </div>

        <ScenarioReadOnly blocks={blocks} />

        <footer className="mt-10 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-500">
          Создано в{' '}
          <Link href="/" className="text-brand-600 hover:underline">
            Planwise — Классный час
          </Link>
          .{' '}
          <Link href="/register" className="text-brand-600 hover:underline">
            Сгенерируйте свой сценарий за минуту →
          </Link>
        </footer>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Проверить**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: чисто.

- [ ] **Step 4: Commit**

```bash
git add app/s/ components/share/CopyToMyAccount.tsx
git commit -m "feat(share): публичная read-only страница /s/[token] (#30)"
```

---

### Task 7: Публичный экспорт `app/api/share/[token]/export/route.ts`

**Files:**
- Create: `app/api/share/[token]/export/route.ts`

Контекст: зеркало `app/api/scenarios/[id]/export/route.ts`, но без `auth()`, поиск по `share_token`, rate-limit по токену. `isExportFormat`, `renderScenarioExport` из `@/lib/export`; `checkRateLimit` из `@/lib/ratelimit`; `logEvent` из `@/lib/events/log`.

- [ ] **Step 1: Роут**

```ts
// app/api/share/[token]/export/route.ts
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { logEvent } from '@/lib/events/log'
import { isExportFormat, renderScenarioExport } from '@/lib/export'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const rl = await checkRateLimit({
    key: 'share-export',
    subject: token,
    limit: Number(process.env.MAX_SHARE_EXPORT_PER_DAY ?? '200'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return new Response('Слишком много запросов', { status: 429 })

  const format = req.nextUrl.searchParams.get('format')
  if (!isExportFormat(format)) return new Response('Unsupported format', { status: 400 })

  const [row] = await db.select().from(scenarios).where(eq(scenarios.shareToken, token)).limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { body, contentType, ext } = await renderScenarioExport(format, row.content, {
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

  await logEvent('export', { userId: null, meta: { format, via: 'share' } })

  const asciiName = `scenario-${row.id}.${ext}`
  const utf8Name = encodeURIComponent(`${row.content.title}.${ext}`).replace(
    /['*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Content-Length': String(body.length),
    },
  })
}
```

Примечание: `checkRateLimit` принимает `email?: string | null` опционально — здесь его не передаём (анонимный доступ по токену), whitelist не применяется. `logEvent('export', { userId: null, meta })` — та же форма, что в приватном роуте.

- [ ] **Step 2: Проверить**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: чисто.

- [ ] **Step 3: Commit**

```bash
git add app/api/share/
git commit -m "feat(share): публичный экспорт PDF/DOCX по токену (#30)"
```

---

### Task 8: UI управления ссылкой в редакторе

**Files:**
- Create: `components/share/ShareLinkControls.tsx`
- Modify: `app/app/scenarios/[id]/editor.tsx` (добавить проп `initialShareToken` + вставить контрол)
- Modify: `app/app/scenarios/[id]/page.tsx` (передать `initialShareToken`)

- [ ] **Step 1: Клиентский контрол ссылки**

```tsx
// components/share/ShareLinkControls.tsx
'use client'

import {
  disableShareLinkAction,
  enableShareLinkAction,
} from '@/app/app/scenarios/[id]/actions'
import { Button } from '@/components/ui/button'
import { useState, useTransition } from 'react'

export function ShareLinkControls({
  scenarioId,
  initialToken,
}: { scenarioId: string; initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [pii, setPii] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const url = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${token}` : ''

  function enable() {
    setPii(null)
    start(async () => {
      const res = await enableShareLinkAction(scenarioId)
      if (res.ok) {
        setToken(res.token)
        if (res.piiWarning) {
          setPii(`В сценарии найдены персональные данные (${res.piiWarning.count}). По ссылке они будут видны всем.`)
        }
      }
    })
  }
  function disable() {
    start(async () => {
      const res = await disableShareLinkAction(scenarioId)
      if (res.ok) {
        setToken(null)
        setCopied(false)
      }
    })
  }
  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!token ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={enable}>
          {pending ? '…' : 'Поделиться ссылкой'}
        </Button>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="h-9 w-64 rounded-md px-2 text-sm text-neutral-700 ring-1 ring-neutral-200"
              aria-label="Публичная ссылка на сценарий"
            />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={disable}>
              Отозвать
            </Button>
          </div>
          {pii && <span className="text-xs text-warm-600">{pii}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Передать токен со страницы в редактор**

В `app/app/scenarios/[id]/page.tsx`: запрос `db.select()` уже тянет всю строку сценария (`.select()` без проекции), значит `scenario.shareToken` доступен. В `<ScenarioEditor ... />` добавить проп:

```tsx
      initialShareToken={scenario.shareToken}
```

- [ ] **Step 3: Принять проп в редакторе и отрендерить контрол**

В `app/app/scenarios/[id]/editor.tsx`:
- добавить импорт: `import { ShareLinkControls } from '@/components/share/ShareLinkControls'`
- расширить сигнатуру/тип пропсов `ScenarioEditor`:

```ts
export function ScenarioEditor({
  meta,
  initialContent,
  initialLiked,
  initialShared,
  initialShareToken,
}: {
  meta: Meta
  initialContent: ScenarioContent
  initialLiked: boolean
  initialShared: boolean
  initialShareToken: string | null
}) {
```

- вставить контрол рядом с `<LikeShareControls .../>` (в том же правом столбце тулбара), сразу ПОСЛЕ блока `<LikeShareControls ... />`:

```tsx
          <ShareLinkControls scenarioId={meta.id} initialToken={initialShareToken} />
```

- [ ] **Step 4: Проверить сборку**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: чисто; в выводе build присутствуют роуты `/app/scenarios/[id]`, `/s/[token]`, `/api/share/[token]/export`.

- [ ] **Step 5: Commit**

```bash
git add components/share/ShareLinkControls.tsx app/app/scenarios/
git commit -m "feat(share): UI управления публичной ссылкой в редакторе (#30)"
```

---

### Task 9: Финальная верификация + docs

- [ ] **Step 1: Полные гейты**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: все зелёные; новые тесты (token — 2) проходят; роуты `/s/[token]` и `/api/share/[token]/export` в выводе build.

- [ ] **Step 2: Обновить backlog + CLAUDE.md**

В `docs/backlog.md`: #30 — пометить часть (а) выполненной, оставить (б) историю версий и (в) og-image как открытые. В `CLAUDE.md` — короткий пост-milestone блок про share-link (колонка `share_token`, роут `/s/[token]`, изоляция по токену, миграция 0012, **деплой требует `db:migrate`**).

- [ ] **Step 3: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: read-only share-link реализован (#30а)"
```

---

## Ручной UAT (перед мержем/демо)

- В редакторе своего сценария: «Поделиться ссылкой» → копировать URL → открыть в приватном окне (без входа) → видно read-only, скачивается PDF и DOCX, есть CTA на регистрацию.
- Включить ссылку на сценарии с ПДн → проверить, что показалось предупреждение автору.
- «Отозвать» → старая ссылка отдаёт 404 (`notFound`).
- Залогиненным открыть чужую ссылку → «Скопировать себе» → попадает в `/app/scenarios/{copy}`, оригинал не изменился.
- Чужой/случайный токен → 404.

## Заметки по deploy

Миграция `0012` (добавление `share_token`) → деплой: `git pull && docker compose up -d --build` (сервис `migrate` применит автоматически). Опц. env: `MAX_SHARE_EXPORT_PER_DAY=200`.
