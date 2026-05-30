# Email Verify (soft) + Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-verify email через ссылку в письме и password reset через свой SMTP `mail.caspernik.ru:465`, без блокировки текущего UX логина.

**Architecture:** Единая таблица `auth_tokens` (sha256-hash, kind `verify|reset`, single-use). Nodemailer transport (implicit TLS, LE-серт). JWT-инвалидация после reset через `users.password_version` + ленивая проверка раз в 60с. Баннер «подтвердите email» в `/app` layout.

**Tech Stack:** Next.js 15 App Router, Drizzle, Auth.js v5 (credentials+JWT), nodemailer, bcryptjs (уже есть), Vitest, существующий `lib/ratelimit`.

**Спека:** `docs/superpowers/specs/2026-05-31-email-verify-and-password-reset-design.md`

**Конвенции:**
- Один коммит на задачу. Перед каждым — `superpowers:verification-before-completion` (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec biome check` затронутых, `pnpm build` для UI-задач).
- TDD для `lib/email/templates`, `lib/auth/tokens`, JWT-pv-check хелпера.
- Без соавторства Claude в коммитах (по решению пользователя).

---

### Task 1: Зависимости и env-плейсхолдеры

**Files:**
- Modify: `package.json` (deps + devDeps)
- Modify: `.env.example`

- [ ] **Step 1: Установить nodemailer + типы**

Run:
```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Expected: `package.json` пополняется `"nodemailer": "^7..."` в deps и `"@types/nodemailer"` в devDeps. `pnpm-lock.yaml` обновлён.

- [ ] **Step 2: Добавить env-блок в `.env.example`**

В конец `.env.example` дописать:

```bash
# SMTP (email verification и password reset)
SMTP_HOST=mail.caspernik.ru
SMTP_PORT=465
SMTP_USER=planwise@caspernik.ru
SMTP_PASS=replace-me
EMAIL_FROM="Planwise <planwise@caspernik.ru>"
APP_URL=https://plan-wise.ru

# Опциональные пороги (с дефолтами)
VERIFY_TOKEN_TTL_SEC=86400
RESET_TOKEN_TTL_SEC=3600
PV_CHECK_INTERVAL_SEC=60
MAX_VERIFY_RESEND_PER_HOUR=3
MAX_FORGOT_PER_HOUR=5
MAX_RESET_ATTEMPT_PER_HOUR=10
```

- [ ] **Step 3: Проверить, что build не сломан**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (никаких импортов nodemailer ещё нет, типы не задействованы).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(deps): nodemailer + env-плейсхолдеры под email verify и password reset"
```

---

### Task 2: Миграция 0015 (`users.password_version` + `auth_tokens`) и drizzle-схема

**Files:**
- Create: `db/migrations/0015_auth_tokens_and_password_version.sql`
- Modify: `db/schema.ts`
- Modify: `db/migrations/meta/_journal.json` (генерируется автоматически через drizzle-kit) и `db/migrations/meta/0015_snapshot.json`

- [ ] **Step 1: Дописать в `db/schema.ts` поле `passwordVersion` на `users`**

В `users = pgTable('users', {...})` (около строки 16–28 файла) после `role` добавить:

```ts
  passwordVersion: integer('password_version').notNull().default(1),
```

Если `integer` ещё не импортирован в этом блоке — он импортируется через общий `import` из `drizzle-orm/pg-core` (проверь существующие импорты; в файле он уже есть для других таблиц).

- [ ] **Step 2: Дописать в `db/schema.ts` новую таблицу `authTokens` (в конце файла, перед последним `export`-ом, либо рядом с `verificationTokens`)**

```ts
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'verify' | 'reset'
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userKindIdx: index('auth_tokens_user_kind_idx').on(t.userId, t.kind),
  }),
)
```

`index` импортируется из `drizzle-orm/pg-core` — добавь к существующему импорту, если ещё нет.

- [ ] **Step 3: Сгенерировать миграцию через drizzle-kit**

Run: `pnpm drizzle-kit generate`
Expected: создан файл `db/migrations/0015_*.sql` (точное имя — на усмотрение drizzle-kit) и обновлён `meta/_journal.json` + `meta/0015_snapshot.json`. Переименуй sql-файл в `0015_auth_tokens_and_password_version.sql` если имя не подходит (не обязательно, но желательно для читаемости — НЕ переименовывай, если drizzle journal ссылается по тагу; в существующих миграциях тэги drizzle-kit оставлены).

- [ ] **Step 4: Проверить содержимое сгенерированной миграции**

Открой созданный `db/migrations/0015_*.sql`. Ожидаемые операции:
- `ALTER TABLE "users" ADD COLUMN "password_version" integer DEFAULT 1 NOT NULL;`
- `CREATE TABLE "auth_tokens" (...)` с колонками выше.
- `CREATE INDEX "auth_tokens_user_kind_idx" ON "auth_tokens" ...`
- FK на `users.id ON DELETE CASCADE`.
- UNIQUE на `token_hash`.

Если чего-то не хватает — допиши SQL вручную (миграции в репо смешанные: drizzle-kit + ручные правки уже встречались, см. `0004_rag_indexes`).

- [ ] **Step 5: Применить миграцию к dev-БД**

Run: `pnpm db:migrate`
Expected: миграция `0015` применена идемпотентно. Проверь:
```bash
docker exec kc-postgres psql -U kc -d kc -c "\d users" | grep password_version
docker exec kc-postgres psql -U kc -d kc -c "\d auth_tokens"
```
Должны быть: `password_version | integer | not null default 1` и таблица `auth_tokens` с 7 колонками.

- [ ] **Step 6: Прогон гейтов**

Run:
```bash
pnpm exec tsc --noEmit
pnpm test
```
Expected: tsc PASS, тесты PASS (новых тестов ещё нет, регрессий быть не должно).

- [ ] **Step 7: Commit**

```bash
git add db/schema.ts db/migrations/0015_*.sql db/migrations/meta/
git commit -m "feat(db): миграция 0015 — auth_tokens + users.password_version"
```

---

### Task 3: `lib/auth/tokens.ts` — issue/consume/invalidate (TDD)

**Files:**
- Create: `lib/auth/tokens.ts`
- Create: `tests/lib/auth/tokens.test.ts`

- [ ] **Step 1: Написать тесты**

```ts
// tests/lib/auth/tokens.test.ts
import { describe, expect, it } from 'vitest'
import { hashToken, issueToken, consumeToken, invalidateUserTokens } from '@/lib/auth/tokens'

type Row = {
  id: string
  userId: string
  kind: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

function makeStore() {
  const rows: Row[] = []
  return {
    rows,
    store: {
      insert: async (r: Omit<Row, 'id' | 'createdAt'>) => {
        rows.push({ id: crypto.randomUUID(), createdAt: new Date(), ...r })
      },
      findByHash: async (hash: string, kind: string) => {
        return rows.find((r) => r.tokenHash === hash && r.kind === kind) ?? null
      },
      markUsed: async (id: string, at: Date) => {
        const r = rows.find((x) => x.id === id)
        if (r) r.usedAt = at
      },
      invalidate: async (userId: string, kind: string, at: Date) => {
        for (const r of rows) {
          if (r.userId === userId && r.kind === kind && r.usedAt === null) r.usedAt = at
        }
      },
      cleanup: async (_olderThan: Date) => {},
    },
  }
}

describe('hashToken', () => {
  it('детерминирован и не равен исходному', () => {
    const a = hashToken('abc')
    const b = hashToken('abc')
    expect(a).toBe(b)
    expect(a).not.toBe('abc')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('issueToken', () => {
  it('возвращает разные raw для одинаковых аргументов', async () => {
    const { store } = makeStore()
    const a = await issueToken('u1', 'verify', 3600, { store })
    const b = await issueToken('u1', 'verify', 3600, { store })
    expect(a.token).not.toBe(b.token)
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() - 1000)
  })

  it('сохраняет sha256 в БД, а не raw', async () => {
    const { rows, store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(rows[0]?.tokenHash).not.toBe(token)
  })
})

describe('consumeToken', () => {
  it('валидный токен → userId + помечен used', async () => {
    const { rows, store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    const r = await consumeToken(token, 'verify', { store })
    expect(r).toEqual({ userId: 'u1' })
    expect(rows[0]?.usedAt).not.toBeNull()
  })

  it('повторный consume того же токена → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    await consumeToken(token, 'verify', { store })
    const r2 = await consumeToken(token, 'verify', { store })
    expect(r2).toBeNull()
  })

  it('истёкший токен → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', -10, { store })
    const r = await consumeToken(token, 'verify', { store })
    expect(r).toBeNull()
  })

  it('чужой kind → null', async () => {
    const { store } = makeStore()
    const { token } = await issueToken('u1', 'verify', 3600, { store })
    const r = await consumeToken(token, 'reset', { store })
    expect(r).toBeNull()
  })

  it('несуществующий токен → null', async () => {
    const { store } = makeStore()
    const r = await consumeToken('not-a-token', 'verify', { store })
    expect(r).toBeNull()
  })
})

describe('invalidateUserTokens', () => {
  it('помечает все неиспользованные токены данного kind', async () => {
    const { rows, store } = makeStore()
    await issueToken('u1', 'verify', 3600, { store })
    await issueToken('u1', 'verify', 3600, { store })
    await issueToken('u1', 'reset', 3600, { store })
    await invalidateUserTokens('u1', 'verify', { store })
    const verify = rows.filter((r) => r.kind === 'verify')
    expect(verify.every((r) => r.usedAt !== null)).toBe(true)
    const reset = rows.filter((r) => r.kind === 'reset')
    expect(reset.every((r) => r.usedAt === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Прогнать тесты — должны упасть**

Run: `pnpm test tests/lib/auth/tokens.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать `lib/auth/tokens.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'

export type TokenKind = 'verify' | 'reset'

export type TokenStore = {
  insert: (row: {
    userId: string
    kind: TokenKind
    tokenHash: string
    expiresAt: Date
    usedAt: Date | null
  }) => Promise<void>
  findByHash: (
    hash: string,
    kind: TokenKind,
  ) => Promise<{
    id: string
    userId: string
    expiresAt: Date
    usedAt: Date | null
  } | null>
  markUsed: (id: string, at: Date) => Promise<void>
  invalidate: (userId: string, kind: TokenKind, at: Date) => Promise<void>
  cleanup: (olderThan: Date) => Promise<void>
}

export type TokenDeps = { store?: TokenStore; now?: Date }

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function generateRawToken(): string {
  return randomBytes(32).toString('base64url')
}

async function getStore(deps: TokenDeps): Promise<TokenStore> {
  if (deps.store) return deps.store
  const mod = await import('./tokens-store')
  return mod.dbTokenStore
}

export async function issueToken(
  userId: string,
  kind: TokenKind,
  ttlSeconds: number,
  deps: TokenDeps = {},
): Promise<{ token: string; expiresAt: Date }> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  // best-effort cleanup устаревших > 7 дней
  await store.cleanup(new Date(now.getTime() - 7 * 86400_000)).catch(() => {})
  const token = generateRawToken()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  await store.insert({
    userId,
    kind,
    tokenHash: hashToken(token),
    expiresAt,
    usedAt: null,
  })
  return { token, expiresAt }
}

export async function consumeToken(
  rawToken: string,
  kind: TokenKind,
  deps: TokenDeps = {},
): Promise<{ userId: string } | null> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  const row = await store.findByHash(hashToken(rawToken), kind)
  if (!row) return null
  if (row.usedAt !== null) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null
  await store.markUsed(row.id, now)
  return { userId: row.userId }
}

export async function invalidateUserTokens(
  userId: string,
  kind: TokenKind,
  deps: TokenDeps = {},
): Promise<void> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  await store.invalidate(userId, kind, now)
}
```

- [ ] **Step 4: Тесты должны зеленеть**

Run: `pnpm test tests/lib/auth/tokens.test.ts`
Expected: PASS (все ~9 кейсов).

- [ ] **Step 5: Реализовать `lib/auth/tokens-store.ts` (Drizzle-адаптер, без юнит-тестов — db-bound)**

```ts
// lib/auth/tokens-store.ts
import { db } from '@/db'
import { authTokens } from '@/db/schema'
import { and, eq, isNull, lt } from 'drizzle-orm'
import type { TokenKind, TokenStore } from './tokens'

export const dbTokenStore: TokenStore = {
  async insert(row) {
    await db.insert(authTokens).values({
      userId: row.userId,
      kind: row.kind,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    })
  },
  async findByHash(hash, kind) {
    const [r] = await db
      .select({
        id: authTokens.id,
        userId: authTokens.userId,
        expiresAt: authTokens.expiresAt,
        usedAt: authTokens.usedAt,
      })
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, kind)))
      .limit(1)
    return r ?? null
  },
  async markUsed(id, at) {
    await db.update(authTokens).set({ usedAt: at }).where(eq(authTokens.id, id))
  },
  async invalidate(userId, kind: TokenKind, at) {
    await db
      .update(authTokens)
      .set({ usedAt: at })
      .where(
        and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
      )
  },
  async cleanup(olderThan) {
    await db.delete(authTokens).where(lt(authTokens.expiresAt, olderThan))
  },
}
```

- [ ] **Step 6: Гейты**

Run:
```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec biome check lib/auth/tokens.ts lib/auth/tokens-store.ts tests/lib/auth/tokens.test.ts
```
Expected: всё PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/tokens.ts lib/auth/tokens-store.ts tests/lib/auth/tokens.test.ts
git commit -m "feat(auth): lib/auth/tokens — sha256-hash, issue/consume/invalidate с DI"
```

---

### Task 4: `lib/email/client.ts` — фабрика SMTP-transport

**Files:**
- Create: `lib/email/client.ts`

- [ ] **Step 1: Написать клиент**

```ts
// lib/email/client.ts
import nodemailer, { type Transporter } from 'nodemailer'

let cached: Transporter | null = null

export function getTransport(): Transporter {
  if (cached) return cached
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? '465')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST/SMTP_USER/SMTP_PASS не настроены')
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // implicit TLS на 465; STARTTLS на 587
    auth: { user, pass },
  })
  return cached
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? 'Planwise <planwise@caspernik.ru>'
}

export function __resetTransportForTests(): void {
  cached = null
}
```

- [ ] **Step 2: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/email/client.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/email/client.ts
git commit -m "feat(email): nodemailer transport-фабрика (implicit TLS на 465)"
```

---

### Task 5: `lib/email/templates.ts` — verify + reset (TDD)

**Files:**
- Create: `lib/email/templates.ts`
- Create: `tests/lib/email/templates.test.ts`

- [ ] **Step 1: Тесты**

```ts
// tests/lib/email/templates.test.ts
import { describe, expect, it } from 'vitest'
import { passwordResetTemplate, verifyEmailTemplate } from '@/lib/email/templates'

describe('verifyEmailTemplate', () => {
  const url = 'https://plan-wise.ru/auth/verify?token=ABC'
  const t = verifyEmailTemplate(url)
  it('возвращает subject/html/text', () => {
    expect(t.subject).toMatch(/Planwise/i)
    expect(t.html).toContain(url)
    expect(t.text).toContain(url)
  })
  it('русский subject/тело', () => {
    expect(t.subject).toMatch(/[А-Яа-яЁё]/)
    expect(t.text).toMatch(/[А-Яа-яЁё]/)
  })
})

describe('passwordResetTemplate', () => {
  const url = 'https://plan-wise.ru/reset?token=XYZ'
  const t = passwordResetTemplate(url)
  it('возвращает subject/html/text c URL в обоих вариантах', () => {
    expect(t.html).toContain(url)
    expect(t.text).toContain(url)
  })
  it('текст упоминает срок жизни 1 час', () => {
    expect(t.text).toMatch(/час/i)
  })
})
```

- [ ] **Step 2: Прогнать — должны упасть**

Run: `pnpm test tests/lib/email/templates.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализовать `lib/email/templates.ts`**

```ts
export type EmailTemplate = { subject: string; html: string; text: string }

const BTN_STYLE =
  'display:inline-block;padding:12px 24px;background:#0e4f30;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600'
const WRAPPER_OPEN =
  '<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px;line-height:1.5">'
const WRAPPER_CLOSE =
  '<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"/><p style="color:#6b7280;font-size:13px">Planwise — генератор сценариев внеурочных занятий.</p></div>'

export function verifyEmailTemplate(url: string): EmailTemplate {
  const subject = 'Planwise — подтвердите email'
  const html =
    `${WRAPPER_OPEN}` +
    `<h2 style="margin:0 0 16px 0">Подтвердите ваш email</h2>` +
    `<p>Спасибо за регистрацию в Planwise. Чтобы подтвердить адрес почты, нажмите на кнопку ниже:</p>` +
    `<p style="margin:24px 0"><a href="${url}" style="${BTN_STYLE}">Подтвердить email</a></p>` +
    `<p style="color:#6b7280;font-size:13px">Если кнопка не работает, скопируйте ссылку в браузер:<br/><a href="${url}">${url}</a></p>` +
    `<p style="color:#6b7280;font-size:13px">Ссылка действует 24 часа. Если вы не регистрировались — просто проигнорируйте письмо.</p>` +
    `${WRAPPER_CLOSE}`
  const text =
    `Подтвердите ваш email в Planwise.\n\n` +
    `Перейдите по ссылке: ${url}\n\n` +
    `Ссылка действует 24 часа. Если вы не регистрировались — проигнорируйте письмо.\n`
  return { subject, html, text }
}

export function passwordResetTemplate(url: string): EmailTemplate {
  const subject = 'Planwise — сброс пароля'
  const html =
    `${WRAPPER_OPEN}` +
    `<h2 style="margin:0 0 16px 0">Сброс пароля</h2>` +
    `<p>Мы получили запрос на сброс пароля для вашего аккаунта Planwise. Чтобы задать новый пароль, нажмите на кнопку ниже:</p>` +
    `<p style="margin:24px 0"><a href="${url}" style="${BTN_STYLE}">Сбросить пароль</a></p>` +
    `<p style="color:#6b7280;font-size:13px">Если кнопка не работает, скопируйте ссылку в браузер:<br/><a href="${url}">${url}</a></p>` +
    `<p style="color:#6b7280;font-size:13px">Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо, ваш пароль останется прежним.</p>` +
    `${WRAPPER_CLOSE}`
  const text =
    `Сброс пароля в Planwise.\n\n` +
    `Перейдите по ссылке: ${url}\n\n` +
    `Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.\n`
  return { subject, html, text }
}
```

- [ ] **Step 4: Тесты зеленеют**

Run: `pnpm test tests/lib/email/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/email/templates.ts tests/lib/email/templates.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/templates.ts tests/lib/email/templates.test.ts
git commit -m "feat(email): inline-шаблоны verify + reset (HTML + text)"
```

---

### Task 6: `lib/email/send.ts` — best-effort обёртки

**Files:**
- Create: `lib/email/send.ts`

- [ ] **Step 1: Написать модуль**

```ts
// lib/email/send.ts
import { getFromAddress, getTransport } from './client'
import { passwordResetTemplate, verifyEmailTemplate } from './templates'

export type SendResult = { ok: true } | { ok: false; error: string }

async function sendRaw(to: string, tpl: { subject: string; html: string; text: string }): Promise<SendResult> {
  try {
    const transport = getTransport()
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] send failed:', msg)
    return { ok: false, error: msg }
  }
}

export async function sendVerificationEmail(to: string, url: string): Promise<SendResult> {
  return sendRaw(to, verifyEmailTemplate(url))
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<SendResult> {
  return sendRaw(to, passwordResetTemplate(url))
}
```

- [ ] **Step 2: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/email/send.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/email/send.ts
git commit -m "feat(email): best-effort sendVerification/sendPasswordReset"
```

---

### Task 7: `lib/auth/pv-check.ts` — JWT password-version check helper (TDD)

**Files:**
- Create: `lib/auth/pv-check.ts`
- Create: `tests/lib/auth/pv-check.test.ts`

- [ ] **Step 1: Тесты**

```ts
// tests/lib/auth/pv-check.test.ts
import { describe, expect, it } from 'vitest'
import { needsPvRecheck } from '@/lib/auth/pv-check'

const nowSec = 1_700_000_000

describe('needsPvRecheck', () => {
  it('первая проверка (pvCheckedAt undefined) → true', () => {
    expect(needsPvRecheck(undefined, nowSec, 60)).toBe(true)
  })
  it('прошёл интервал → true', () => {
    expect(needsPvRecheck(nowSec - 120, nowSec, 60)).toBe(true)
  })
  it('интервал не прошёл → false', () => {
    expect(needsPvRecheck(nowSec - 30, nowSec, 60)).toBe(false)
  })
  it('точно граница → true (>=)', () => {
    expect(needsPvRecheck(nowSec - 60, nowSec, 60)).toBe(true)
  })
})
```

- [ ] **Step 2: Прогнать — упадут**

Run: `pnpm test tests/lib/auth/pv-check.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `lib/auth/pv-check.ts`**

```ts
export function needsPvRecheck(
  pvCheckedAt: number | undefined,
  nowSec: number,
  intervalSec: number,
): boolean {
  if (pvCheckedAt === undefined) return true
  return nowSec - pvCheckedAt >= intervalSec
}
```

- [ ] **Step 4: Тесты зеленеют**

Run: `pnpm test tests/lib/auth/pv-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Гейты + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/auth/pv-check.ts tests/lib/auth/pv-check.test.ts
git add lib/auth/pv-check.ts tests/lib/auth/pv-check.test.ts
git commit -m "feat(auth): pv-check хелпер для ленивой инвалидации JWT после reset"
```

---

### Task 8: Интеграция `passwordVersion` и `emailVerified` в `auth.ts`

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Расширить `Session.user` типизацию**

В `declare module 'next-auth'` в `auth.ts` (около строки 9–13):

```ts
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: string
      emailVerified: Date | null
    } & DefaultSession['user']
  }
}
```

- [ ] **Step 2: В `authorize` вернуть `passwordVersion` и `emailVerified` вместе с юзером**

```ts
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          passwordVersion: user.passwordVersion,
          emailVerified: user.emailVerified ?? null,
        }
```

Обнови also возвращаемый тип `authorize` (если строгий — добавь поля через `as never` или extend через `next-auth/credentials` тип; в текущей кодовой базе `authorize` возвращает `User`-расширение без явной аннотации — достаточно вернуть объект с лишними полями, TS их пропустит).

- [ ] **Step 3: Расширить `jwt`-callback**

Полностью замени блок callbacks:

```ts
  callbacks: {
    async jwt({ token, user }) {
      const intervalSec = Number(process.env.PV_CHECK_INTERVAL_SEC ?? '60')
      const nowSec = Math.floor(Date.now() / 1000)
      if (user) {
        const u = user as {
          id: string
          role?: string
          passwordVersion?: number
          emailVerified?: Date | null
        }
        token.id = u.id
        token.role = u.role ?? 'user'
        token.passwordVersion = u.passwordVersion ?? 1
        token.emailVerified = u.emailVerified ? u.emailVerified.toISOString() : null
        token.pvCheckedAt = nowSec
        return token
      }
      const { needsPvRecheck } = await import('@/lib/auth/pv-check')
      if (needsPvRecheck(token.pvCheckedAt as number | undefined, nowSec, intervalSec)) {
        if (!token.id) return token
        const { db } = await import('@/db')
        const { users } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [row] = await db
          .select({ pv: users.passwordVersion, ev: users.emailVerified })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1)
        if (!row) return null
        if (row.pv !== (token.passwordVersion as number)) return null
        token.emailVerified = row.ev ? row.ev.toISOString() : null
        token.pvCheckedAt = nowSec
      }
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      session.user.role = (token.role as string) ?? 'user'
      const ev = token.emailVerified as string | null | undefined
      session.user.emailVerified = ev ? new Date(ev) : null
      return session
    },
  },
```

- [ ] **Step 4: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm test
pnpm exec biome check auth.ts
```
Expected: всё PASS. Если падает типизация `Session.user.emailVerified` где-то ещё (например, в admin-страницах) — НЕ исправляй там; добавление optional поля не должно ничего ломать; если требуется — задача 13 коснётся.

- [ ] **Step 5: Build (важно — затронут auth callback)**

Run: `pnpm build`
Expected: PASS, без новых ошибок.

- [ ] **Step 6: Commit**

```bash
git add auth.ts
git commit -m "feat(auth): passwordVersion + emailVerified в JWT, ленивая проверка раз в N секунд"
```

---

### Task 9: `registerAction` — best-effort verify email после регистрации

**Files:**
- Modify: `app/(auth)/register/actions.ts`

- [ ] **Step 1: Импорты + помощник для baseUrl**

В начало файла, после существующих импортов, добавить:

```ts
import { issueToken } from '@/lib/auth/tokens'
import { sendVerificationEmail } from '@/lib/email/send'
import { baseUrlFromRequest } from '@/lib/auth/base-url'
import { headers } from 'next/headers'
```

- [ ] **Step 2: После `await db.insert(users)...` и ДО `signIn` вставить:**

Сразу после строки `await db.insert(users).values({ email, name, passwordHash })`:

```ts
  // best-effort: токен подтверждения + письмо. Сбой не валит регистрацию.
  try {
    const [created] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (created) {
      const ttl = Number(process.env.VERIFY_TOKEN_TTL_SEC ?? '86400')
      const { token } = await issueToken(created.id, 'verify', ttl)
      const h = await headers()
      const baseUrl =
        process.env.APP_URL ?? process.env.AUTH_URL ?? baseUrlFromRequest(h)
      const url = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`
      await sendVerificationEmail(email, url)
    }
  } catch (err) {
    console.error('[register] verify email best-effort failed:', err)
  }
```

- [ ] **Step 3: Проверить, что `baseUrlFromRequest` принимает `Headers` (или `ReadonlyHeaders`)**

Run: `pnpm exec tsc --noEmit`

Если TS возражает на тип `Headers` — посмотри сигнатуру `lib/auth/base-url.ts`. Если она принимает `Request` (а не `Headers`) — построй ручной fallback:

```ts
const h = await headers()
const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
const proto = h.get('x-forwarded-proto') ?? 'https'
const baseUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? `${proto}://${host}`
```

(Замени блок с `baseUrlFromRequest` на этот, если сигнатура не подошла.)

- [ ] **Step 4: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm test
pnpm exec biome check 'app/(auth)/register/actions.ts'
pnpm build
```
Expected: всё PASS.

- [ ] **Step 5: Commit**

```bash
git add 'app/(auth)/register/actions.ts'
git commit -m "feat(auth): registerAction отправляет письмо verify (best-effort)"
```

---

### Task 10: Страница `/auth/verify` — consume токена

**Files:**
- Create: `app/auth/verify/page.tsx`

- [ ] **Step 1: Написать страницу**

```tsx
// app/auth/verify/page.tsx
import { db } from '@/db'
import { users } from '@/db/schema'
import { consumeToken } from '@/lib/auth/tokens'
import { eq, isNull, and } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Search = { token?: string }

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { token } = await searchParams
  if (!token) return <ErrorCard message="Ссылка без токена. Попросите новую в личном кабинете." />

  const result = await consumeToken(token, 'verify')
  if (!result) {
    return <ErrorCard message="Ссылка недействительна или истекла. Войдите и нажмите «Отправить ещё раз»." />
  }

  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(and(eq(users.id, result.userId), isNull(users.emailVerified)))

  redirect('/app?verified=1')
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-3">Подтверждение email</h1>
        <p className="text-neutral-700 mb-6">{message}</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors">
          На страницу входа
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check app/auth/verify/page.tsx
pnpm build
```
Expected: роут `/auth/verify` в выводе билда, PASS.

- [ ] **Step 3: Commit**

```bash
git add app/auth/verify/page.tsx
git commit -m "feat(auth): страница /auth/verify — consume токена и пометка email_verified"
```

---

### Task 11: Resend verification action + баннер в `/app` layout

**Files:**
- Create: `components/auth/VerifyEmailBanner.tsx`
- Create: `app/(auth)/actions/resend-verify.ts`
- Modify: `app/app/layout.tsx`

- [ ] **Step 1: `resend-verify.ts` server action**

```ts
// app/(auth)/actions/resend-verify.ts
'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { issueToken, invalidateUserTokens } from '@/lib/auth/tokens'
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

  // already verified — noop
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
```

- [ ] **Step 2: `components/auth/VerifyEmailBanner.tsx`**

```tsx
// components/auth/VerifyEmailBanner.tsx
'use client'

import { useTransition, useState } from 'react'
import { resendVerificationAction } from '@/app/(auth)/actions/resend-verify'

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="bg-warm-50 border-b border-warm-200 px-6 py-3 text-sm">
      <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-3 justify-between">
        <span className="text-warm-900">
          Подтвердите почту — мы отправили письмо на <b>{email}</b>.
        </span>
        <div className="flex items-center gap-3">
          {msg && (
            <span className={msg.ok ? 'text-brand-700' : 'text-warm-800'}>{msg.text}</span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMsg(null)
              startTransition(async () => {
                const r = await resendVerificationAction()
                setMsg(
                  r.ok
                    ? { ok: true, text: 'Письмо отправлено.' }
                    : { ok: false, text: r.error ?? 'Ошибка.' },
                )
              })
            }}
            className="px-3 py-1.5 rounded-lg bg-warm-700 text-white hover:bg-warm-800 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Отправляем…' : 'Отправить ещё раз'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Подключить баннер в `app/app/layout.tsx`**

После строки `if (!session?.user) redirect('/login')` и до `return`:

```ts
  const unverified = session.user.emailVerified == null
```

В JSX после `<AppNavbar ... />` и до `<main>`:

```tsx
      {unverified && <VerifyEmailBanner email={session.user.email ?? ''} />}
```

Импорт сверху файла:

```ts
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner'
```

- [ ] **Step 4: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check 'app/(auth)/actions/resend-verify.ts' components/auth/VerifyEmailBanner.tsx app/app/layout.tsx
pnpm build
```
Expected: PASS. Роут `/app` всё ещё в выводе.

- [ ] **Step 5: Commit**

```bash
git add 'app/(auth)/actions/resend-verify.ts' components/auth/VerifyEmailBanner.tsx app/app/layout.tsx
git commit -m "feat(auth): баннер «подтвердите email» в /app + resend action с rate-limit"
```

---

### Task 12: `/forgot` страница + action

**Files:**
- Create: `app/(auth)/forgot/page.tsx`
- Create: `app/(auth)/forgot/actions.ts`

- [ ] **Step 1: Action**

```ts
// app/(auth)/forgot/actions.ts
'use server'

import { db } from '@/db'
import { users } from '@/db/schema'
import { issueToken, invalidateUserTokens } from '@/lib/auth/tokens'
import { sendPasswordResetEmail } from '@/lib/email/send'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
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
  // generic ответ — не палим существование email
  return { ok: true }
}
```

- [ ] **Step 2: Страница**

```tsx
// app/(auth)/forgot/page.tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { forgotPasswordAction, type ForgotState } from './actions'

export default function ForgotPage() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    null,
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Сброс пароля</h1>
        <p className="text-neutral-700 mb-6">
          Введите email от аккаунта Planwise. Если он зарегистрирован, мы отправим письмо со ссылкой
          для сброса пароля.
        </p>
        {state?.ok ? (
          <div className="rounded-xl bg-brand-50 ring-1 ring-brand-200 p-4 text-brand-900">
            Если email зарегистрирован, мы отправили письмо. Проверьте почту (и папку «Спам»).
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-neutral-800 mb-1">Email</span>
              <input
                type="email"
                name="email"
                required
                className="w-full px-3 py-2 rounded-lg ring-1 ring-neutral-300 focus:ring-brand-500 focus:outline-none"
              />
            </label>
            {state?.error && <p className="text-sm text-warm-800">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              {pending ? 'Отправляем…' : 'Отправить ссылку'}
            </button>
          </form>
        )}
        <p className="text-sm text-neutral-600 mt-6">
          <Link href="/login" className="text-brand-700 hover:underline">
            ← На страницу входа
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check 'app/(auth)/forgot/'
pnpm build
```
Expected: роут `/forgot` в выводе.

- [ ] **Step 4: Commit**

```bash
git add 'app/(auth)/forgot/'
git commit -m "feat(auth): страница /forgot — запрос сброса пароля с generic-ответом"
```

---

### Task 13: `/reset` страница + action + session invalidation

**Files:**
- Create: `app/(auth)/reset/page.tsx`
- Create: `app/(auth)/reset/actions.ts`

- [ ] **Step 1: Action**

```ts
// app/(auth)/reset/actions.ts
'use server'

import { db } from '@/db'
import { users } from '@/db/schema'
import { consumeToken } from '@/lib/auth/tokens'
import { hashPassword } from '@/lib/auth/password'
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
```

- [ ] **Step 2: Страница**

```tsx
// app/(auth)/reset/page.tsx
'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { resetPasswordAction, type ResetState } from './actions'

function ResetForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    null,
  )

  if (!token) {
    return (
      <p className="text-warm-800">
        Ссылка без токена.{' '}
        <Link href="/forgot" className="text-brand-700 hover:underline">
          Запросить новую
        </Link>
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="block text-sm font-medium text-neutral-800 mb-1">Новый пароль</span>
        <input
          type="password"
          name="password"
          minLength={8}
          required
          className="w-full px-3 py-2 rounded-lg ring-1 ring-neutral-300 focus:ring-brand-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-neutral-800 mb-1">Повторите пароль</span>
        <input
          type="password"
          name="passwordConfirm"
          minLength={8}
          required
          className="w-full px-3 py-2 rounded-lg ring-1 ring-neutral-300 focus:ring-brand-500 focus:outline-none"
        />
      </label>
      {state?.error && <p className="text-sm text-warm-800">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
      >
        {pending ? 'Сохраняем…' : 'Задать новый пароль'}
      </button>
    </form>
  )
}

export default function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Новый пароль</h1>
        <p className="text-neutral-700 mb-6">Введите новый пароль для своего аккаунта Planwise.</p>
        <Suspense fallback={<p className="text-neutral-500">Загрузка…</p>}>
          <ResetForm />
        </Suspense>
        <p className="text-sm text-neutral-600 mt-6">
          <Link href="/login" className="text-brand-700 hover:underline">
            ← На страницу входа
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check 'app/(auth)/reset/'
pnpm build
```
Expected: роут `/reset` в выводе.

- [ ] **Step 4: Commit**

```bash
git add 'app/(auth)/reset/'
git commit -m "feat(auth): страница /reset — установка нового пароля + bump password_version"
```

---

### Task 14: Ссылки и success-баннеры на `/login` и `/app`

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/app/page.tsx` (или `app/app/layout.tsx` — куда лучше ложится success-баннер verified=1)

- [ ] **Step 1: На `/login` под полем password добавить ссылку «Забыли пароль?»**

Найди в `app/(auth)/login/page.tsx` блок с input'ом password и сразу после него (внутри той же `<form>`) добавь:

```tsx
<p className="text-sm text-right -mt-2">
  <Link href="/forgot" className="text-brand-700 hover:underline">
    Забыли пароль?
  </Link>
</p>
```

Импорт `import Link from 'next/link'` если ещё нет.

- [ ] **Step 2: На `/login` показать success-баннер при `?reset=1`**

В начале return-блока страницы, после открытия карточки, добавь компонент:

```tsx
// читаем search-параметр (страница может быть client; используй useSearchParams)
```

Реализация:
- Если страница уже client (`'use client'`) — добавь `const params = useSearchParams(); const reset = params.get('reset') === '1'` и рендерь блок:
  ```tsx
  {reset && (
    <div className="mb-4 rounded-xl bg-brand-50 ring-1 ring-brand-200 p-3 text-brand-900 text-sm">
      Пароль обновлён. Войдите с новым паролем.
    </div>
  )}
  ```
- Если страница server-компонент — добавь параметр `searchParams: Promise<{reset?: string}>` и проверь `(await searchParams).reset === '1'` для рендера того же блока (без `useSearchParams`).

Сначала проверь, какой типы у `app/(auth)/login/page.tsx` — измени соответствующим образом.

- [ ] **Step 3: На `/app` показать success-баннер при `?verified=1`**

В `app/app/page.tsx` (это уже существует — server component) добавь параметр:

```tsx
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>
}) {
  const { verified } = await searchParams
  ...
}
```

В JSX в самом верху списка вставь:

```tsx
{verified === '1' && (
  <div className="mb-4 rounded-xl bg-brand-50 ring-1 ring-brand-200 p-3 text-brand-900 text-sm">
    Email подтверждён. Спасибо!
  </div>
)}
```

(Если `app/app/page.tsx` уже принимает `searchParams` — добавь только поле, не ломая существующее.)

- [ ] **Step 4: Гейты**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec biome check 'app/(auth)/login/page.tsx' app/app/page.tsx
pnpm build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'app/(auth)/login/page.tsx' app/app/page.tsx
git commit -m "feat(auth): ссылка «забыли пароль» и success-баннеры reset=1 / verified=1"
```

---

### Task 15: Changelog, CLAUDE.md, финальные гейты, push

**Files:**
- Modify: `lib/changelog.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Добавить пункт в текущую версию `v1.9.0` в `lib/changelog.ts`**

Открой `lib/changelog.ts`, найди объект v1.9.0 (он первый в массиве `CHANGELOG`) и добавь два пункта в блок `changes`:

```ts
  { kind: 'feature', text: 'Подтверждение email после регистрации (soft-режим) — ссылка в письме + баннер до подтверждения.' },
  { kind: 'feature', text: 'Сброс пароля по ссылке из письма (/forgot → /reset) с инвалидацией старых сессий.' },
```

Затем **отсортируй ВСЕ пункты в блоке v1.9.0 в порядке** `feature` → `improvement` → `fix` (память `feedback-changelog-order`).

- [ ] **Step 2: Дописать блок-статус в `CLAUDE.md`**

В разделе «Пост-milestone изменения (на master, вне нумерованных планов)» в конец добавить новый bullet (по образцу предыдущих):

```
- **Email-подтверждение (soft) + сброс пароля (2026-05-31, на master):** реализовано через brainstorming → spec → writing-plans → subagent-driven. Спека `docs/superpowers/specs/2026-05-31-email-verify-and-password-reset-design.md`, план `docs/superpowers/plans/2026-05-31-email-verify-and-password-reset.md`. **Миграция 0015** (`users.password_version` + `auth_tokens(id, user_id, kind, token_hash sha256, expires_at, used_at)`). `lib/email/` — nodemailer-обёртка над `mail.caspernik.ru:465` (implicit TLS, LE-серт, Node доверяет из коробки); `lib/auth/tokens.ts` — issue/consume/invalidate с DI (TDD); `auth.ts` — `passwordVersion`+`emailVerified` в JWT, ленивая проверка раз в `PV_CHECK_INTERVAL_SEC` (деф.60с) → после reset все JWT инвалидируются. Soft-verify: `registerAction` best-effort отправляет письмо (сбой SMTP не валит регистрацию); страница `/auth/verify?token=…` (`consumeToken` → `email_verified=now()`); баннер `VerifyEmailBanner` в `/app` layout с кнопкой Resend (rate-limit 3/час/user). Password reset: `/forgot` (rate-limit 5/час/IP, generic-ответ против user enumeration), `/reset?token=…` (rate-limit 10/час/IP, bcrypt + `password_version+1` + автo-verify, если ещё не подтверждён). Ссылка «Забыли пароль?» на `/login`; success-баннеры `/login?reset=1` и `/app?verified=1`. Env-ключи: `SMTP_HOST/PORT/USER/PASS/EMAIL_FROM/APP_URL` + `VERIFY_TOKEN_TTL_SEC` (24ч), `RESET_TOKEN_TTL_SEC` (1ч), `PV_CHECK_INTERVAL_SEC` (60с), три `MAX_*_PER_HOUR`. Гейты: tsc, biome, build, тесты. **Деплой требует `db:migrate`** (миграция 0015). **Ручной UAT перед мержем (8 шагов в спеке §4):** живая регистрация → письмо → клик → verified; Resend; `/forgot` → письмо → reset → старая сессия редиректит на /login в течение 60с; сбой SMTP не валит регистрацию. **Известные ограничения:** окно атаки до 60с после reset (ленивая проверка `password_version`); очередь писем/retry отсутствует; smoke-тест на реальную доставку — ручной.
```

- [ ] **Step 3: Финальный прогон гейтов**

Run:
```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec biome check lib/changelog.ts CLAUDE.md 2>/dev/null || true
pnpm build
```
Expected: тесты PASS (включая 12 новых: tokens 9, templates 4, pv-check 4), tsc PASS, build PASS со всеми новыми роутами (`/auth/verify`, `/forgot`, `/reset`).

- [ ] **Step 4: Коммит changelog+CLAUDE.md (БЕЗ соавторства)**

```bash
git add lib/changelog.ts CLAUDE.md
git commit -m "docs: changelog v1.9.0 + CLAUDE.md — email verify (soft) и password reset"
```

- [ ] **Step 5: Push в `s21_planwise`**

Run: `git push origin master`
Expected: PASS.

---

## Ручной UAT перед мержем/демо (НЕ часть тасков плана)

Выполнить против стейджа/прод после деплоя — чек-лист в `docs/superpowers/specs/2026-05-31-email-verify-and-password-reset-design.md §4`. Кратко:

1. Register → письмо приходит ≤30с → клик → `/app?verified=1`, баннер пропал.
2. Register → Resend × 4 → 4-й «лимит».
3. `/forgot` с существующим email → письмо → reset → старый пароль не работает, новый работает.
4. `/forgot` с несуществующим email → тот же generic-ответ, письмо не отправляется.
5. После reset открыть `/app` во второй вкладке → редирект на `/login` в течение 60с.
6. Reset-ссылка повторно → «токен использован».
7. Неверный `SMTP_PASS` → регистрация всё равно проходит, в логах ошибка.

---

## Self-review (по спеке)

| Требование спеки | Закрыто в задаче |
|---|---|
| §2.1 `lib/email/` (client+templates+send) | T4, T5, T6 |
| §2.2 `lib/auth/tokens.ts` (issue/consume/invalidate + sha256) | T3 |
| §2.3 миграция 0015 (`password_version`, `auth_tokens`) | T2 |
| §2.3 `auth.ts` — passwordVersion в JWT + emailVerified в session + lazy check | T8 (хелпер pv-check — T7) |
| §2.4 registerAction send verify (best-effort) | T9 |
| §2.4 `/auth/verify` страница | T10 |
| §2.4 `resendVerificationAction` (rate-limit 3/час/user) | T11 |
| §2.4 `/forgot` (rate-limit 5/час/IP, generic ответ) | T12 |
| §2.4 `/reset` (rate-limit 10/час/IP, `password_version+1`, auto-verify) | T13 |
| §2.5 баннер в `/app` layout | T11 |
| §2.5 ссылка «Забыли пароль?» на `/login` | T14 |
| §2.5 `?reset=1` / `?verified=1` success-баннеры | T14 |
| §2.6 базовый URL из APP_URL → AUTH_URL → headers | T9, T11, T12 |
| §3 безопасность (sha256, single-use, rate-limit, no enumeration) | T2/T3/T11/T12/T13 |
| §4 тестирование TDD (templates, tokens, pv-check) | T3, T5, T7 |
| §5 env-ключи | T1 |
| §6 деплой (миграция автоматом через сервис `migrate`) | T2 (миграция), запуск — оператор |
| §7 зависимость nodemailer | T1 |

Размытостей не обнаружено. Типы согласованы (`TokenStore` сигнатура одна на T3 и T3-store, `TokenDeps` идентичен по всему файлу). Названия функций/полей идентичны между задачами (`issueToken`, `consumeToken`, `invalidateUserTokens`, `password_version`, `emailVerified`).
