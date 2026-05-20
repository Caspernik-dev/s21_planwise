# Plan 2 — Generation v0 (single-shot, без RAG и без стрима)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Залогиненный пользователь заполняет форму (направление/класс/тема/длительность/формат), сервер одним вызовом GigaChat генерирует структурированный сценарий, валидирует его zod-схемой, нормализует хронометраж, сохраняет в БД и показывает read-only страницу сценария. Без RAG, без стриминга, без редактора.

**Architecture:** Server Action на `/app/new` собирает ввод → чистая функция `generateScenario` строит промпт, вызывает GigaChat chat-completion (один call, при невалидном JSON один repair-call), парсит и валидирует `ScenarioContent` через zod, нормализует длительности этапов под заданную длительность → сохраняем `scenarios` + первый снапшот `scenario_versions` + лог `generations` → redirect на `/app/scenarios/[id]` (read-only). GigaChat-клиент: OAuth-токен (in-memory кэш с refresh за 60с до истечения) + chat-completion. Юнит-тесты мокают `fetch`; реальный API дёргаем только на финальном phase-verify.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Drizzle ORM, PostgreSQL 16, zod, Vitest (мок `fetch`), GigaChat REST (OAuth + `/chat/completions`).

**Out of scope (последующие планы):** RAG retrieval, pre-match по shared, стриминг (SSE), редактор (TipTap/↑↓/точечная регенерация), embeddings, лайки/shared, экспорт PDF/DOCX, загрузка файлов и PII, rate-limit/whitelist, календарь. Эти колонки/таблицы НЕ создаём здесь — добавим в своих планах.

---

## Что уже есть (Plan 1, не трогаем без причины)

- `db/schema.ts` — `users`, `accounts`, `sessions`, `verification_tokens`. Клиент `db/index.ts` (`postgres-js`, `max:10`). Миграции `db/migrations/0000_*`, `0001_enable_pgvector`. Runner `db/migrate.ts` (грузит `.env.local`).
- Auth.js v5: `auth.ts` (`auth()`, JWT-сессия, `session.user.id`/`.email`/`.name`). Защита `/app/*` через `middleware.ts` + проверка в `app/app/layout.tsx`.
- Защищённый кабинет лежит в `app/app/` (маршрут `/app`), дашборд — `app/app/page.tsx`. **Важно:** auth-страницы в группе `app/(auth)/`, а кабинет — в `app/app/` (НЕ route-group). Новые экраны генерации кладём внутрь `app/app/`.
- UI-примитивы: `components/ui/{button,input,label,card}.tsx`. Хелпер `cn` в `lib/utils.ts`.
- `.env.local` уже содержит `GIGACHAT_AUTH_KEY` (base64 `client_id:client_secret`) и `GIGACHAT_SCOPE=GIGACHAT_API_PERS`.
- Тесты: Vitest, `tests/setup.ts` (пустой), `vitest.config.ts` с алиасом `@`. Линт/формат — Biome (`single` quotes, `asNeeded` semicolons, `all` trailing commas, ширина 100, отступ 2 пробела). **Весь новый код пишем в этом стиле.**

---

## Файловая структура к концу плана

```
db/
  schema.ts                      # + scenarios, scenarioVersions, generations
  migrations/0002_*.sql          # сгенерируется

lib/
  scenario/
    schema.ts                    # zod ScenarioContent + типы + GenerationInput/Meta
    options.ts                   # справочники: направления, форматы, длительности, классы
    normalize.ts                 # нормализация хронометража этапов (TDD)
    prompt.ts                    # builder messages для single-shot
    generate.ts                  # оркестрация: prompt → chat → parse → validate → repair → normalize
  gigachat/
    types.ts                     # типы запросов/ответов
    config.ts                    # чтение env (base url, oauth url, model, scope, insecure tls)
    token.ts                     # OAuth access-token с in-memory кэшем
    client.ts                    # chatCompletion()

app/app/
  new/
    page.tsx                     # форма генерации (client)
    actions.ts                   # server action generateScenarioAction
  scenarios/
    [id]/
      page.tsx                   # read-only просмотр сценария
  page.tsx                       # + кнопка «Создать сценарий» и список последних

tests/
  lib/scenario/
    normalize.test.ts
    schema.test.ts
    prompt.test.ts
    generate.test.ts
  lib/gigachat/
    token.test.ts
    client.test.ts
```

---

## Task 1: Env — эндпоинты и параметры GigaChat

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (gitignored — правим, но НЕ коммитим)

- [ ] **Step 1: Дополнить `.env.example`** — заменить блок GigaChat и добавить блок генерации.

Найти в `.env.example` существующий блок:

```
# GigaChat (заполнить в .env.local; на этом этапе плана не используется)
GIGACHAT_AUTH_KEY=
GIGACHAT_SCOPE=GIGACHAT_API_PERS
```

Заменить на:

```
# GigaChat
GIGACHAT_AUTH_KEY=
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_OAUTH_URL=https://ngw.devices.sberbank.ru:9443/api/v2/oauth
GIGACHAT_API_BASE=https://gigachat.devices.sberbank.ru/api/v1
GIGACHAT_MODEL=GigaChat
# GigaChat использует сертификаты «Минцифры РФ». Если в окружении нет корневого
# сертификата — выставить true (отключает проверку TLS только для GigaChat-запросов).
GIGACHAT_INSECURE_TLS=false
```

- [ ] **Step 2: Добавить те же ключи в `.env.local`** (значения `GIGACHAT_AUTH_KEY`/`SCOPE` там уже есть — не трогать; дописать остальные).

Дописать в `.env.local`:

```
GIGACHAT_OAUTH_URL=https://ngw.devices.sberbank.ru:9443/api/v2/oauth
GIGACHAT_API_BASE=https://gigachat.devices.sberbank.ru/api/v1
GIGACHAT_MODEL=GigaChat
GIGACHAT_INSECURE_TLS=true
```

(`true` локально — у dev-машины обычно нет корневого сертификата Минцифры.)

- [ ] **Step 3: Commit** (только пример, `.env.local` gitignored)

```bash
git add .env.example
git commit -m "chore(env): add gigachat endpoints and model config"
```

---

## Task 2: zod-схема ScenarioContent + типы ввода (TDD)

**Files:**
- Create: `lib/scenario/schema.ts`, `lib/scenario/options.ts`
- Test: `tests/lib/scenario/schema.test.ts`

- [ ] **Step 1: Создать `lib/scenario/options.ts`** (справочники для формы и валидации)

```ts
export const DIRECTIONS = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
] as const

export const FORMATS = ['классный час', 'беседа', 'квиз', 'игра', 'мастерская'] as const

export const DURATIONS = [20, 30, 45] as const

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

export type Direction = (typeof DIRECTIONS)[number]
export type Format = (typeof FORMATS)[number]
```

- [ ] **Step 2: Написать падающий тест `tests/lib/scenario/schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { generationInputSchema, scenarioContentSchema } from '@/lib/scenario/schema'

const validContent = {
  title: 'Дружба и взаимопомощь',
  goals: ['Сформировать представление о ценности дружбы'],
  materials: ['Проектор', 'Карточки с ситуациями'],
  stages: [
    {
      kind: 'engage',
      title: 'Введение',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Что такое дружба?', questions: ['Кого вы считаете другом?'] }],
    },
    {
      kind: 'main',
      title: 'Основная часть',
      duration_min: 20,
      activities: [{ type: 'game', text: 'Игра на доверие' }],
    },
    {
      kind: 'reflection',
      title: 'Рефлексия',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'Что нового узнали?' }],
    },
  ],
  adaptations: { simpler: 'Упростить вопросы', harder: 'Добавить дебаты' },
}

describe('scenarioContentSchema', () => {
  it('accepts a well-formed scenario', () => {
    expect(scenarioContentSchema.safeParse(validContent).success).toBe(true)
  })

  it('rejects empty stages', () => {
    const bad = { ...validContent, stages: [] }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown stage kind', () => {
    const bad = { ...validContent, stages: [{ ...validContent.stages[0], kind: 'wrong' }] }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown activity type', () => {
    const bad = {
      ...validContent,
      stages: [
        {
          ...validContent.stages[0],
          activities: [{ type: 'song', text: 'x' }],
        },
        validContent.stages[1],
        validContent.stages[2],
      ],
    }
    expect(scenarioContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects missing adaptations', () => {
    const { adaptations, ...rest } = validContent
    expect(scenarioContentSchema.safeParse(rest).success).toBe(false)
  })
})

describe('generationInputSchema', () => {
  it('accepts valid form input', () => {
    const r = generationInputSchema.safeParse({
      direction: 'Патриотическое',
      grade: '5',
      topic: 'День Победы',
      durationMin: '30',
      format: 'классный час',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.grade).toBe(5)
      expect(r.data.durationMin).toBe(30)
    }
  })

  it('rejects out-of-range grade', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '12',
        topic: 'x',
        durationMin: '30',
        format: 'классный час',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown format', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '5',
        topic: 'x',
        durationMin: '30',
        format: 'лекция',
      }).success,
    ).toBe(false)
  })

  it('rejects empty topic', () => {
    expect(
      generationInputSchema.safeParse({
        direction: 'Патриотическое',
        grade: '5',
        topic: '   ',
        durationMin: '30',
        format: 'классный час',
      }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 3: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/scenario/schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/scenario/schema'`.

- [ ] **Step 4: Создать `lib/scenario/schema.ts`**

```ts
import { z } from 'zod'
import { DIRECTIONS, FORMATS } from './options'

export const activitySchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  text: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
})

export const stageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.number().int().positive(),
  activities: z.array(activitySchema).min(1),
})

export const scenarioContentSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  materials: z.array(z.string()),
  stages: z.array(stageSchema).min(1),
  adaptations: z.object({
    simpler: z.string().min(1),
    harder: z.string().min(1),
  }),
})

export type ScenarioContent = z.infer<typeof scenarioContentSchema>
export type ScenarioStage = z.infer<typeof stageSchema>

// Ввод формы. Числовые поля приходят строками из FormData → coerce + проверка диапазона.
export const generationInputSchema = z.object({
  direction: z.enum(DIRECTIONS),
  grade: z.coerce.number().int().min(1).max(11),
  topic: z.string().trim().min(1, 'Укажите тему').max(200),
  durationMin: z.coerce.number().int().min(5).max(120),
  format: z.enum(FORMATS),
})

export type GenerationInput = z.infer<typeof generationInputSchema>

// Метаданные генерации, кладём в scenarios.generation_meta.
export type GenerationMeta = {
  model: string
  promptVersion: string
  repaired: boolean
  normalized: boolean
  usage: { promptTokens: number; completionTokens: number } | null
  latencyMs: number
}
```

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/scenario/schema.test.ts`
Expected: PASS все кейсы.

- [ ] **Step 6: Commit**

```bash
git add lib/scenario/schema.ts lib/scenario/options.ts tests/lib/scenario/schema.test.ts
git commit -m "feat(scenario): zod ScenarioContent + form input schema with tests"
```

---

## Task 3: Схема БД — scenarios, scenario_versions, generations

**Files:**
- Modify: `db/schema.ts`
- Create (генерируется): `db/migrations/0002_*.sql`

> Зависит от Task 2: `db/schema.ts` импортирует типы из `@/lib/scenario/schema`, поэтому Task 2 должен быть завершён до `pnpm db:generate`.

- [ ] **Step 1: Дописать таблицы в конец `db/schema.ts`**

Сначала добавить `jsonb` в импорт drizzle (первая строка файла):

```ts
import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
```

Затем дописать импорт типов и таблицы в конец файла:

```ts
import type { GenerationInput, GenerationMeta, ScenarioContent } from '@/lib/scenario/schema'

export const scenarios = pgTable('scenarios', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  direction: text('direction').notNull(),
  grade: integer('grade').notNull(),
  durationMin: integer('duration_min').notNull(),
  format: text('format').notNull(),
  topic: text('topic').notNull(),
  // Forward-compat: источники (таблицы plan_topics/shared_scenarios появятся в своих планах).
  sourcePlanTopicId: text('source_plan_topic_id'),
  sourceSharedId: text('source_shared_id'),
  content: jsonb('content').$type<ScenarioContent>().notNull(),
  inputContext: jsonb('input_context').$type<GenerationInput>().notNull(),
  generationMeta: jsonb('generation_meta').$type<GenerationMeta>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const scenarioVersions = pgTable('scenario_versions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  scenarioId: text('scenario_id')
    .notNull()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<ScenarioContent>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const generations = pgTable('generations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scenarioId: text('scenario_id').references(() => scenarios.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  status: text('status').notNull(), // 'ok' | 'error'
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: создаётся `db/migrations/0002_<name>.sql` с `CREATE TABLE scenarios / scenario_versions / generations`, FK на `users`/`scenarios`, и `meta`-снапшот обновлён. Никаких неожиданных DROP.

- [ ] **Step 3: Применить миграцию**

Убедиться, что БД поднята: `docker compose ps` → `kc-postgres` `Up (healthy)`. Если нет — `pnpm db:up`.
Run: `pnpm db:migrate`
Expected: `Applying migrations...` → `Done.`

Run: `docker exec kc-postgres psql -U kc -d kc -c "\dt"`
Expected: среди таблиц есть `scenarios`, `scenario_versions`, `generations`.

Run: `docker exec kc-postgres psql -U kc -d kc -c "\d scenarios"`
Expected: колонки `content`/`input_context`/`generation_meta` типа `jsonb`, `grade`/`duration_min` — `integer`, FK `user_id`.

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "feat(db): scenarios, scenario_versions, generations tables + migration"
```

---

## Task 4: Нормализация хронометража (TDD)

**Files:**
- Create: `lib/scenario/normalize.ts`
- Test: `tests/lib/scenario/normalize.test.ts`

Цель: сумма `duration_min` по этапам должна точно равняться целевой длительности занятия. Масштабируем пропорционально, округляем, остаток добавляем к последнему этапу. Возвращаем новый объект + флаг `changed`.

- [ ] **Step 1: Написать падающий тест `tests/lib/scenario/normalize.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { normalizeChronometry } from '@/lib/scenario/normalize'

function content(durations: number[]): ScenarioContent {
  return {
    title: 't',
    goals: ['g'],
    materials: [],
    stages: durations.map((d, i) => ({
      kind: i === 0 ? 'engage' : i === durations.length - 1 ? 'reflection' : 'main',
      title: `s${i}`,
      duration_min: d,
      activities: [{ type: 'discussion', text: 'x' }],
    })),
    adaptations: { simpler: 's', harder: 'h' },
  }
}

describe('normalizeChronometry', () => {
  it('leaves content unchanged when sum already equals target', () => {
    const { content: out, changed } = normalizeChronometry(content([5, 20, 5]), 30)
    expect(out.stages.map((s) => s.duration_min)).toEqual([5, 20, 5])
    expect(changed).toBe(false)
  })

  it('scales down proportionally and preserves exact total', () => {
    const { content: out, changed } = normalizeChronometry(content([10, 40, 10]), 30)
    const total = out.stages.reduce((a, s) => a + s.duration_min, 0)
    expect(total).toBe(30)
    expect(changed).toBe(true)
  })

  it('scales up and preserves exact total', () => {
    const { content: out } = normalizeChronometry(content([5, 10, 5]), 45)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(45)
  })

  it('keeps every stage at least 1 minute', () => {
    const { content: out } = normalizeChronometry(content([1, 1, 100]), 5)
    expect(out.stages.every((s) => s.duration_min >= 1)).toBe(true)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(5)
  })

  it('handles zero total defensively (distributes target evenly)', () => {
    const { content: out } = normalizeChronometry(content([0, 0]), 10)
    expect(out.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(10)
    expect(out.stages.every((s) => s.duration_min >= 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/scenario/normalize.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `lib/scenario/normalize.ts`**

```ts
import type { ScenarioContent } from './schema'

export function normalizeChronometry(
  content: ScenarioContent,
  targetMin: number,
): { content: ScenarioContent; changed: boolean } {
  const stages = content.stages
  const n = stages.length
  const current = stages.reduce((a, s) => a + s.duration_min, 0)

  if (current === targetMin) return { content, changed: false }

  // Пропорциональное масштабирование; при нулевой сумме — равномерно.
  const raw =
    current > 0
      ? stages.map((s) => (s.duration_min / current) * targetMin)
      : stages.map(() => targetMin / n)

  // Округляем вниз, минимум 1 минута на этап.
  let durations = raw.map((v) => Math.max(1, Math.floor(v)))

  // Подгоняем точную сумму: распределяем разницу по этапам.
  let diff = targetMin - durations.reduce((a, v) => a + v, 0)
  // diff может быть + (добавить) или - (убрать, не опускаясь ниже 1).
  let i = 0
  let guard = 0
  while (diff !== 0 && guard < 10000) {
    const idx = i % n
    if (diff > 0) {
      durations[idx] += 1
      diff -= 1
    } else if (durations[idx] > 1) {
      durations[idx] -= 1
      diff += 1
    }
    i += 1
    guard += 1
  }

  const newStages = stages.map((s, idx) => ({ ...s, duration_min: durations[idx] }))
  return { content: { ...content, stages: newStages }, changed: true }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/scenario/normalize.test.ts`
Expected: PASS все кейсы.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/normalize.ts tests/lib/scenario/normalize.test.ts
git commit -m "feat(scenario): proportional chronometry normalization with tests"
```

---

## Task 5: Промпт-builder для single-shot (TDD)

**Files:**
- Create: `lib/scenario/prompt.ts`
- Test: `tests/lib/scenario/prompt.test.ts`

- [ ] **Step 1: Написать падающий тест `tests/lib/scenario/prompt.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { PROMPT_VERSION, buildMessages } from '@/lib/scenario/prompt'

const input = {
  direction: 'Патриотическое' as const,
  grade: 6,
  topic: 'День Победы',
  durationMin: 30,
  format: 'классный час' as const,
}

describe('buildMessages', () => {
  it('returns a system and a user message', () => {
    const msgs = buildMessages(input)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
  })

  it('system message forbids real children names and demands JSON', () => {
    const sys = buildMessages(input)[0].content
    expect(sys.toLowerCase()).toContain('json')
    expect(sys).toContain('имён')
  })

  it('user message embeds all context fields', () => {
    const user = buildMessages(input)[1].content
    expect(user).toContain('Патриотическое')
    expect(user).toContain('6')
    expect(user).toContain('День Победы')
    expect(user).toContain('30')
    expect(user).toContain('классный час')
  })

  it('exposes a stable prompt version string', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/scenario/prompt.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `lib/scenario/prompt.ts`**

```ts
import type { GenerationInput } from './schema'

export const PROMPT_VERSION = 'v0-single-shot-2026-05-20'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const SCHEMA_HINT = `Структура JSON (строго соблюдай ключи и типы):
{
  "title": string,
  "goals": string[],              // воспитательные результаты, 1-4 пункта
  "materials": string[],          // что нужно для занятия
  "stages": [                     // минимум 3 этапа: вовлечение, основная часть, рефлексия
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,     // целое, в минутах; сумма по этапам ≈ длительности занятия
      "activities": [
        {
          "type": "discussion" | "quiz" | "game" | "task" | "video",
          "text": string,
          "questions"?: string[]  // конкретные вопросы, не общие
        }
      ]
    }
  ],
  "adaptations": { "simpler": string, "harder": string }
}`

export function buildMessages(input: GenerationInput): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Генерируешь сценарии строго в формате JSON, без markdown-обёрток и пояснений.',
    'Правила: возрастная адаптация, активная роль детей, конкретные вопросы (не общие),',
    'указание ведущей роли педагога, обязательная рефлексия в конце.',
    'Никогда не используй реальные имён детей или персональные данные.',
    '',
    SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект по схеме. Никакого текста до или после.',
  ].join('\n')

  const user = [
    'Сгенерируй сценарий внеурочного занятия со следующими параметрами:',
    `- Направление воспитания: ${input.direction}`,
    `- Класс: ${input.grade}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/scenario/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/prompt.ts tests/lib/scenario/prompt.test.ts
git commit -m "feat(scenario): single-shot prompt builder with tests"
```

---

## Task 6: GigaChat — типы и config

**Files:**
- Create: `lib/gigachat/types.ts`, `lib/gigachat/config.ts`

- [ ] **Step 0: Установить `undici`** (для TLS-диспетчера; Next тянет её транзитивно, но фиксируем явно)

Run: `pnpm add undici`
Expected: добавляется в `dependencies` без ошибок.

- [ ] **Step 1: Создать `lib/gigachat/types.ts`**

```ts
export type GigaMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatCompletionRequest = {
  model: string
  messages: GigaMessage[]
  temperature?: number
  max_tokens?: number
  stream?: false
}

export type ChatCompletionResponse = {
  choices: Array<{ message: { role: string; content: string }; finish_reason?: string }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export type OAuthResponse = {
  access_token: string
  expires_at: number // unix epoch в миллисекундах
}

export type ChatResult = {
  content: string
  usage: { promptTokens: number; completionTokens: number } | null
}
```

- [ ] **Step 2: Создать `lib/gigachat/config.ts`**

```ts
export type GigaConfig = {
  authKey: string
  scope: string
  oauthUrl: string
  apiBase: string
  model: string
  insecureTls: boolean
}

export function getGigaConfig(): GigaConfig {
  const authKey = process.env.GIGACHAT_AUTH_KEY
  if (!authKey) throw new Error('GIGACHAT_AUTH_KEY is not set')

  return {
    authKey,
    scope: process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS',
    oauthUrl: process.env.GIGACHAT_OAUTH_URL ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    apiBase: process.env.GIGACHAT_API_BASE ?? 'https://gigachat.devices.sberbank.ru/api/v1',
    model: process.env.GIGACHAT_MODEL ?? 'GigaChat',
    insecureTls: process.env.GIGACHAT_INSECURE_TLS === 'true',
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/gigachat/types.ts lib/gigachat/config.ts package.json pnpm-lock.yaml
git commit -m "feat(gigachat): types, env config, undici dependency"
```

---

## Task 7: GigaChat OAuth-токен с кэшем (TDD)

**Files:**
- Create: `lib/gigachat/token.ts`
- Test: `tests/lib/gigachat/token.test.ts`

Логика: `getAccessToken()` возвращает закэшированный токен, пока до `expires_at` остаётся > 60 секунд; иначе делает OAuth-запрос (`POST` form-urlencoded, `Authorization: Basic <authKey>`, заголовок `RqUID` = uuid, тело `scope=...`). Экспортируем `__resetTokenCacheForTests()` для изоляции тестов.

- [ ] **Step 1: Написать падающий тест `tests/lib/gigachat/token.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetTokenCacheForTests, getAccessToken } from '@/lib/gigachat/token'

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdDp0ZXN0' // base64 "test:test"
  process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  process.env.GIGACHAT_OAUTH_URL = 'https://oauth.example/api/v2/oauth'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubOAuth(token: string, expiresAt: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_at: expiresAt }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('getAccessToken', () => {
  it('fetches a token and sends Basic auth + scope + RqUID', async () => {
    const fetchMock = stubOAuth('tok-1', Date.now() + 30 * 60 * 1000)
    const tok = await getAccessToken()
    expect(tok).toBe('tok-1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://oauth.example/api/v2/oauth')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Basic dGVzdDp0ZXN0')
    expect(init.headers.RqUID).toBeTruthy()
    expect(String(init.body)).toContain('scope=GIGACHAT_API_PERS')
  })

  it('caches the token across calls while valid', async () => {
    const fetchMock = stubOAuth('tok-cached', Date.now() + 30 * 60 * 1000)
    await getAccessToken()
    await getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes when token is within 60s of expiry', async () => {
    const fetchMock = stubOAuth('tok-soon', Date.now() + 30 * 1000) // истекает через 30с
    await getAccessToken()
    await getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }),
    )
    await expect(getAccessToken()).rejects.toThrow(/GigaChat OAuth/)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/gigachat/token.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `lib/gigachat/token.ts`**

```ts
import { getGigaConfig } from './config'
import type { OAuthResponse } from './types'
import { getDispatcher } from './dispatcher'

type CacheEntry = { token: string; expiresAt: number }
let cache: CacheEntry | null = null

const REFRESH_MARGIN_MS = 60_000

export function __resetTokenCacheForTests() {
  cache = null
}

export async function getAccessToken(): Promise<string> {
  if (cache && cache.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cache.token
  }

  const cfg = getGigaConfig()
  const body = new URLSearchParams({ scope: cfg.scope })

  const res = await fetch(cfg.oauthUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${cfg.authKey}`,
      RqUID: crypto.randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    // @ts-expect-error undici-only option, игнорируется в тестовом моке
    dispatcher: getDispatcher(cfg.insecureTls),
  })

  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`GigaChat OAuth failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as OAuthResponse
  cache = { token: data.access_token, expiresAt: data.expires_at }
  return cache.token
}
```

- [ ] **Step 4: Создать `lib/gigachat/dispatcher.ts`** (TLS-обход для самоподписанных сертификатов GigaChat)

```ts
import { Agent } from 'undici'

// undici Agent с отключённой проверкой TLS — только когда GIGACHAT_INSECURE_TLS=true.
// Обход скоупится на GigaChat-запросы (передаётся в опцию `dispatcher` конкретного fetch),
// не трогает остальной TLS. В тестах fetch замокан → диспетчер не используется.
let agent: Agent | null = null

export function getDispatcher(insecure: boolean): Agent | undefined {
  if (!insecure) return undefined
  if (!agent) agent = new Agent({ connect: { rejectUnauthorized: false } })
  return agent
}
```

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/gigachat/token.test.ts`
Expected: PASS все 4 кейса.

- [ ] **Step 6: Commit**

```bash
git add lib/gigachat/token.ts lib/gigachat/dispatcher.ts tests/lib/gigachat/token.test.ts
git commit -m "feat(gigachat): cached oauth token with tls dispatcher and tests"
```

---

## Task 8: GigaChat chat-completion клиент (TDD)

**Files:**
- Create: `lib/gigachat/client.ts`
- Test: `tests/lib/gigachat/client.test.ts`

- [ ] **Step 1: Написать падающий тест `tests/lib/gigachat/client.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetTokenCacheForTests } from '@/lib/gigachat/token'
import { chatCompletion } from '@/lib/gigachat/client'

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdDp0ZXN0'
  process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  process.env.GIGACHAT_OAUTH_URL = 'https://oauth.example/api/v2/oauth'
  process.env.GIGACHAT_API_BASE = 'https://giga.example/api/v1'
  process.env.GIGACHAT_MODEL = 'GigaChat'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Первый fetch — OAuth, второй — chat. Возвращаем разные ответы по URL.
function stubFlow(chatContent: string) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/oauth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', expires_at: Date.now() + 30 * 60 * 1000 }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: chatContent } }],
        usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
      }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chatCompletion', () => {
  it('returns assistant content and usage', async () => {
    stubFlow('привет')
    const r = await chatCompletion([{ role: 'user', content: 'hi' }])
    expect(r.content).toBe('привет')
    expect(r.usage).toEqual({ promptTokens: 11, completionTokens: 22 })
  })

  it('sends Bearer token and model in the chat request', async () => {
    const fetchMock = stubFlow('ok')
    await chatCompletion([{ role: 'user', content: 'hi' }], { temperature: 0.3 })

    const chatCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/chat/completions'))
    expect(chatCall).toBeTruthy()
    const [url, init] = chatCall!
    expect(url).toBe('https://giga.example/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const payload = JSON.parse(String(init.body))
    expect(payload.model).toBe('GigaChat')
    expect(payload.temperature).toBe(0.3)
    expect(payload.stream).toBe(false)
  })

  it('throws on chat non-ok', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/oauth')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'tok', expires_at: Date.now() + 1_800_000 }),
        }
      }
      return { ok: false, status: 500, text: async () => 'boom' }
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toThrow(/GigaChat chat/)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/gigachat/client.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `lib/gigachat/client.ts`**

```ts
import { getGigaConfig } from './config'
import { getDispatcher } from './dispatcher'
import { getAccessToken } from './token'
import type { ChatCompletionResponse, ChatResult, GigaMessage } from './types'

export type ChatOptions = { temperature?: number; maxTokens?: number }

export async function chatCompletion(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const cfg = getGigaConfig()
  const token = await getAccessToken()

  const res = await fetch(`${cfg.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2400,
      stream: false,
    }),
    // @ts-expect-error undici-only option, игнорируется в тестовом моке
    dispatcher: getDispatcher(cfg.insecureTls),
  })

  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`GigaChat chat failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content ?? ''
  const usage = data.usage
    ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
    : null

  return { content, usage }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/gigachat/client.test.ts`
Expected: PASS все 3 кейса.

- [ ] **Step 5: Commit**

```bash
git add lib/gigachat/client.ts tests/lib/gigachat/client.test.ts
git commit -m "feat(gigachat): chat-completion client with tests"
```

---

## Task 9: Оркестрация генерации (TDD)

**Files:**
- Create: `lib/scenario/generate.ts`
- Test: `tests/lib/scenario/generate.test.ts`

`generateScenario(input, deps?)`: строит messages → `chat()` (по умолчанию `chatCompletion`, в тестах подменяем) → извлекает JSON (срезает markdown-фенсы) → `scenarioContentSchema.safeParse`. Если невалидно — один repair-call (просим вернуть только JSON по схеме), снова парс/валидация. Если опять невалидно — кидаем ошибку. После валидации — `normalizeChronometry` под `input.durationMin`. Возвращает `{ content, meta }`.

- [ ] **Step 1: Написать падающий тест `tests/lib/scenario/generate.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { generateScenario } from '@/lib/scenario/generate'
import type { GenerationInput } from '@/lib/scenario/schema'

const input: GenerationInput = {
  direction: 'Патриотическое',
  grade: 6,
  topic: 'День Победы',
  durationMin: 30,
  format: 'классный час',
}

const validJson = JSON.stringify({
  title: 'День Победы',
  goals: ['Воспитание уважения к подвигу народа'],
  materials: ['Проектор'],
  stages: [
    { kind: 'engage', title: 'Вступление', duration_min: 10, activities: [{ type: 'discussion', text: 'Что вы знаете о войне?' }] },
    { kind: 'main', title: 'Основная часть', duration_min: 40, activities: [{ type: 'task', text: 'Письмо ветерану' }] },
    { kind: 'reflection', title: 'Итог', duration_min: 10, activities: [{ type: 'discussion', text: 'Что запомнилось?' }] },
  ],
  adaptations: { simpler: 'Меньше дат', harder: 'Доклад' },
})

describe('generateScenario', () => {
  it('parses JSON wrapped in markdown fences and normalizes chronometry', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: '```json\n' + validJson + '\n```',
      usage: { promptTokens: 100, completionTokens: 200 },
    })
    const { content, meta } = await generateScenario(input, { chat })
    expect(content.title).toBe('День Победы')
    expect(content.stages.reduce((a, s) => a + s.duration_min, 0)).toBe(30)
    expect(meta.normalized).toBe(true)
    expect(meta.repaired).toBe(false)
    expect(meta.usage).toEqual({ promptTokens: 100, completionTokens: 200 })
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('runs a single repair pass when first response is invalid JSON', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: 'это не json вообще', usage: null })
      .mockResolvedValueOnce({ content: validJson, usage: { promptTokens: 50, completionTokens: 60 } })
    const { content, meta } = await generateScenario(input, { chat })
    expect(content.title).toBe('День Победы')
    expect(meta.repaired).toBe(true)
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('throws when repair also fails', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'мусор', usage: null })
    await expect(generateScenario(input, { chat })).rejects.toThrow(/валидн/i)
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('throws when schema validation fails even with valid JSON', async () => {
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ title: 'x' }), usage: null })
    await expect(generateScenario(input, { chat })).rejects.toThrow()
    expect(chat).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/scenario/generate.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `lib/scenario/generate.ts`**

```ts
import { getGigaConfig } from '@/lib/gigachat/config'
import { chatCompletion } from '@/lib/gigachat/client'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { normalizeChronometry } from './normalize'
import { PROMPT_VERSION, buildMessages } from './prompt'
import { type GenerationInput, type GenerationMeta, type ScenarioContent, scenarioContentSchema } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type GenerateDeps = { chat?: ChatFn }

// Срезает markdown-фенсы и вытаскивает первый JSON-объект.
function extractJson(raw: string): unknown {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('JSON-объект не найден в ответе')
  }
  return JSON.parse(s.slice(start, end + 1))
}

function tryParse(raw: string): ScenarioContent | null {
  try {
    const obj = extractJson(raw)
    const parsed = scenarioContentSchema.safeParse(obj)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function generateScenario(
  input: GenerationInput,
  deps: GenerateDeps = {},
): Promise<{ content: ScenarioContent; meta: GenerationMeta }> {
  const chat = deps.chat ?? chatCompletion
  const cfg = (() => {
    try {
      return getGigaConfig()
    } catch {
      return { model: process.env.GIGACHAT_MODEL ?? 'GigaChat' }
    }
  })()

  const started = Date.now()
  const messages = buildMessages(input)

  const first = await chat(messages, { temperature: 0.4 })
  let usage = first.usage
  let parsed = tryParse(first.content)
  let repaired = false

  if (!parsed) {
    repaired = true
    const repairMessages: GigaMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content:
          'Ответ был невалидным. Верни ТОЛЬКО валидный JSON-объект строго по описанной схеме, без markdown и пояснений.',
      },
    ]
    const second = await chat(repairMessages, { temperature: 0.2 })
    usage = second.usage ?? usage
    parsed = tryParse(second.content)
  }

  if (!parsed) {
    throw new Error('GigaChat вернул невалидный сценарий после repair-попытки')
  }

  const { content, changed } = normalizeChronometry(parsed, input.durationMin)

  const meta: GenerationMeta = {
    model: cfg.model,
    promptVersion: PROMPT_VERSION,
    repaired,
    normalized: changed,
    usage,
    latencyMs: Date.now() - started,
  }

  return { content, meta }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/scenario/generate.test.ts`
Expected: PASS все 4 кейса.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/generate.ts tests/lib/scenario/generate.test.ts
git commit -m "feat(scenario): generation orchestration with repair pass and tests"
```

---

## Task 10: Server action генерации + сохранение

**Files:**
- Create: `app/app/new/actions.ts`

Server action: проверяет сессию, валидирует ввод `generationInputSchema`, вызывает `generateScenario`, пишет `scenarios` + `scenario_versions` (initial snapshot) + `generations` (status ok/error), затем `redirect('/app/scenarios/<id>')`. Ошибки возвращает в стейт.

- [ ] **Step 1: Создать `app/app/new/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { generations, scenarioVersions, scenarios } from '@/db/schema'
import { generateScenario } from '@/lib/scenario/generate'
import { generationInputSchema } from '@/lib/scenario/schema'

export type NewScenarioState = { error?: string } | null

export async function generateScenarioAction(
  _prev: NewScenarioState,
  formData: FormData,
): Promise<NewScenarioState> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const parsed = generationInputSchema.safeParse({
    direction: formData.get('direction'),
    grade: formData.get('grade'),
    topic: formData.get('topic'),
    durationMin: formData.get('durationMin'),
    format: formData.get('format'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте поля формы' }
  }
  const input = parsed.data

  let scenarioId: string
  try {
    const { content, meta } = await generateScenario(input)

    const [row] = await db
      .insert(scenarios)
      .values({
        userId,
        title: content.title,
        direction: input.direction,
        grade: input.grade,
        durationMin: input.durationMin,
        format: input.format,
        topic: input.topic,
        content,
        inputContext: input,
        generationMeta: meta,
      })
      .returning({ id: scenarios.id })

    scenarioId = row.id

    await db.insert(scenarioVersions).values({ scenarioId, content })
    await db.insert(generations).values({
      userId,
      scenarioId,
      promptTokens: meta.usage?.promptTokens ?? null,
      completionTokens: meta.usage?.completionTokens ?? null,
      latencyMs: meta.latencyMs,
      status: 'ok',
    })
  } catch (e) {
    await db
      .insert(generations)
      .values({ userId, scenarioId: null, latencyMs: null, status: 'error' })
      .catch(() => {})
    console.error('generateScenarioAction failed:', e)
    return { error: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }

  redirect(`/app/scenarios/${scenarioId}`)
}
```

- [ ] **Step 2: Проверить компиляцию типов**

Run: `pnpm build`
Expected: сборка проходит (страница `/app/new` ещё не создана — это нормально, action не импортируется ниоткуда, но должен компилироваться). Если падает на неиспользуемом импорте — оставить как есть до Task 11, где появится потребитель; либо временно пропустить build до Task 11. **Рекомендация:** не запускать build здесь, отложить до Task 11; ограничиться `pnpm lint`.

Run: `pnpm lint`
Expected: без errors.

- [ ] **Step 3: Commit**

```bash
git add app/app/new/actions.ts
git commit -m "feat(generate): server action to generate and persist scenario"
```

---

## Task 11: Форма `/app/new`

**Files:**
- Create: `app/app/new/page.tsx`

Клиентский компонент с `useActionState`, селекторы направления/класса/длительности/формата и поле темы. Стиль — Card + ui-примитивы, как auth-страницы. Кнопка submit с pending-состоянием («Генерируем…» — это может занять 10-30с).

- [ ] **Step 1: Создать `app/app/new/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DIRECTIONS, DURATIONS, FORMATS, GRADES } from '@/lib/scenario/options'
import { type NewScenarioState, generateScenarioAction } from './actions'

const selectClass =
  'flex h-10 w-full rounded-md bg-neutral-0 px-3 text-sm text-neutral-900 ring-1 ring-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'

export default function NewScenarioPage() {
  const [state, formAction, pending] = useActionState<NewScenarioState, FormData>(
    generateScenarioAction,
    null,
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold text-neutral-900">Новый сценарий</h1>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>Параметры занятия</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="direction">Направление воспитания</Label>
              <select id="direction" name="direction" required className={selectClass} defaultValue={DIRECTIONS[0]}>
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="grade">Класс</Label>
                <select id="grade" name="grade" required className={selectClass} defaultValue="5">
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g} класс
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="durationMin">Длительность</Label>
                <select id="durationMin" name="durationMin" required className={selectClass} defaultValue="30">
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} минут
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="format">Формат</Label>
              <select id="format" name="format" required className={selectClass} defaultValue={FORMATS[0]}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topic">Тема</Label>
              <Input id="topic" name="topic" required maxLength={200} placeholder="Например: Дружба и взаимопомощь" />
            </div>

            {state?.error && <p className="text-sm text-error">{state.error}</p>}

            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Генерируем… (до 30 секунд)' : 'Сгенерировать сценарий'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Проверить рендер формы**

Run: `pnpm dev`
Открыть `http://localhost:3000/app/new` (залогиниться, если редиректит на /login).
Expected: форма с 5 полями рендерится, без ошибок в консоли. Сабмит пока можно не жать (нужен реальный GigaChat — проверим на Task 13). Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/app/new/page.tsx
git commit -m "feat(ui): generation form at /app/new"
```

---

## Task 12: Read-only просмотр `/app/scenarios/[id]`

**Files:**
- Create: `app/app/scenarios/[id]/page.tsx`

Серверный компонент. Достаёт сценарий по `id` И `user_id = session.user.id` (изоляция данных — критерий жюри). Если нет — `notFound()`. Рендерит заголовок, мета (направление/класс/длительность/формат), цели, материалы, этапы с активностями и вопросами, адаптации.

- [ ] **Step 1: Создать `app/app/scenarios/[id]/page.tsx`**

```tsx
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { scenarios } from '@/db/schema'

const KIND_LABEL: Record<string, string> = {
  engage: 'Вовлечение',
  main: 'Основная часть',
  reflection: 'Рефлексия',
}

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { id } = await params

  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.userId, session.user.id)))
    .limit(1)

  if (!scenario) notFound()
  const content = scenario.content

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900">{content.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[
              scenario.direction,
              `${scenario.grade} класс`,
              `${scenario.durationMin} мин`,
              scenario.format,
            ].map((b) => (
              <span key={b} className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-200">
                {b}
              </span>
            ))}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/app">К дашборду</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Цели</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-neutral-700">
            {content.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {content.materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Материалы</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-neutral-700">
              {content.materials.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {content.stages.map((stage, i) => (
          <Card key={`${stage.title}-${i}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{stage.title}</span>
                <span className="text-sm font-normal text-neutral-500">
                  {KIND_LABEL[stage.kind] ?? stage.kind} · {stage.duration_min} мин
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stage.activities.map((a, j) => (
                <div key={j} className="rounded-md bg-neutral-50 p-3">
                  <span className="text-xs uppercase tracking-wide text-neutral-400">{a.type}</span>
                  <p className="mt-1 text-neutral-800">{a.text}</p>
                  {a.questions && a.questions.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-neutral-600">
                      {a.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Адаптация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-neutral-700">
          <p>
            <span className="font-medium text-neutral-900">Проще: </span>
            {content.adaptations.simpler}
          </p>
          <p>
            <span className="font-medium text-neutral-900">Сложнее: </span>
            {content.adaptations.harder}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

> **Зависимость:** компонент использует `<Button asChild>`. Текущий `components/ui/button.tsx` (Plan 1) **не поддерживает** `asChild`. В Step 2 добавим поддержку, иначе TS-ошибка.

- [ ] **Step 2: Добавить поддержку `asChild` в `components/ui/button.tsx`**

Это легальная правка чужого файла: новый функционал требует пропа, которого нет. Минимально, без `@radix-ui/react-slot` (не в зависимостях) — клонируем единственного ребёнка.

Открыть `components/ui/button.tsx`. Заменить интерфейс и тело `Button` на:

```tsx
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className)
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
      })
    }
    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
```

- [ ] **Step 3: Проверить просмотр + изоляцию**

Run: `pnpm build`
Expected: сборка проходит (теперь action и страница имеют потребителей, типы сходятся).

(Полную ручную проверку рендера сценария делаем на Task 13 после реальной генерации. Изоляцию проверим там же: чужой `id` → 404.)

- [ ] **Step 4: Commit**

```bash
git add app/app/scenarios/ components/ui/button.tsx
git commit -m "feat(ui): read-only scenario view with user_id isolation; button asChild"
```

---

## Task 13: Кнопка «Создать» и список последних на дашборде

**Files:**
- Modify: `app/app/page.tsx`

- [ ] **Step 1: Переписать `app/app/page.tsx`** (серверный компонент: кнопка + последние сценарии пользователя)

```tsx
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db'
import { scenarios } from '@/db/schema'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const recent = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      direction: scenarios.direction,
      grade: scenarios.grade,
      format: scenarios.format,
      createdAt: scenarios.createdAt,
    })
    .from(scenarios)
    .where(eq(scenarios.userId, session.user.id))
    .orderBy(desc(scenarios.createdAt))
    .limit(10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">Мои сценарии</h1>
        <Button asChild>
          <Link href="/app/new">Создать сценарий</Link>
        </Button>
      </div>

      {recent.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Пока пусто</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            Создайте первый сценарий — укажите направление, класс, тему, длительность и формат.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recent.map((s) => (
            <Link key={s.id} href={`/app/scenarios/${s.id}`}>
              <Card className="h-full transition hover:shadow-hover">
                <CardHeader>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  {[s.direction, `${s.grade} класс`, s.format].map((b) => (
                    <span key={b} className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">
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

- [ ] **Step 2: Проверить дашборд**

Run: `pnpm dev`
Открыть `/app` (залогиненным). Expected: заголовок «Мои сценарии», кнопка «Создать сценарий» ведёт на `/app/new`, пустое состояние, если сценариев нет. Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/app/page.tsx
git commit -m "feat(ui): dashboard with create button and recent scenarios list"
```

---

## Task 14: Финальная проверка фазы (включая реальный GigaChat)

**Цель:** убедиться, что весь пайплайн работает с нуля, тесты/линт/билд зелёные, и хотя бы одна реальная генерация прошла end-to-end.

- [ ] **Step 1: Все юнит-тесты**

Run: `pnpm test`
Expected: PASS — все тесты Plan 1 (6) + новые (schema, normalize, prompt, token, client, generate). Никаких падений.

- [ ] **Step 2: Линт и сборка**

Run: `pnpm lint`
Expected: без errors (warnings допустимы).
Run: `pnpm build`
Expected: production build без ошибок; маршруты `/app/new`, `/app/scenarios/[id]` присутствуют в выводе.

- [ ] **Step 3: Реальный end-to-end (требует валидных GIGACHAT_* в `.env.local`)**

Убедиться, что БД поднята (`pnpm db:up`) и миграции применены (`pnpm db:migrate`).
Run: `pnpm dev`
1. Войти под существующим пользователем (или зарегистрироваться на `/register`).
2. `/app` → «Создать сценарий» → заполнить форму (например: Патриотическое / 6 класс / «День Победы» / 30 минут / классный час) → submit.
3. Ожидание 10-30с → редирект на `/app/scenarios/<id>` с отрендеренным сценарием: заголовок, цели, материалы, этапы с активностями/вопросами, адаптации.
4. Проверить, что сумма длительностей этапов = 30 (нормализация сработала).
5. `/app` → новый сценарий виден в списке.

Проверка БД:
Run: `docker exec kc-postgres psql -U kc -d kc -c "SELECT id, title, direction, grade, duration_min FROM scenarios;"`
Expected: запись есть.
Run: `docker exec kc-postgres psql -U kc -d kc -c "SELECT status, prompt_tokens, completion_tokens, latency_ms FROM generations;"`
Expected: строка `ok` с заполненными токенами/латентностью.

- [ ] **Step 4: Проверка изоляции данных**

В браузере открыть `/app/scenarios/00000000-0000-0000-0000-000000000000` (несуществующий/чужой id).
Expected: страница 404 (`notFound()`), не утечка чужих данных.

Ctrl-C dev-сервер.

- [ ] **Step 5: Тег и лог**

```bash
git tag -a generation-v0-done -m "Plan 2 complete: single-shot generation"
git log --oneline foundation-done..generation-v0-done > docs/superpowers/plans/2026-05-20-plan-2-generation-v0.log
git add docs/superpowers/plans/2026-05-20-plan-2-generation-v0.log
git commit -m "docs: log commits for plan 2"
```

- [ ] **Step 6: Обновить статус в CLAUDE.md**

В разделе «Статус реализации» отметить Plan 2 как ГОТОВ и Plan 3 как следующий (RAG). Коммит:

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): mark plan 2 done, plan 3 next"
```

---

## Success Criteria (Plan 2 выполнен, если)

- [ ] `pnpm test` зелёный: добавлены тесты для `schema`, `normalize`, `prompt`, `gigachat/token`, `gigachat/client`, `scenario/generate`
- [ ] Миграция `0002` создаёт `scenarios`, `scenario_versions`, `generations`; `pnpm db:migrate` на чистой БД проходит
- [ ] GigaChat-клиент кэширует OAuth-токен и обновляет за 60с до истечения (покрыто тестом)
- [ ] Форма `/app/new` принимает направление/класс/тему/длительность/формат
- [ ] Server action генерирует один сценарий (без RAG, без стрима), валидирует zod, нормализует хронометраж, сохраняет `scenarios` + `scenario_versions` + `generations`
- [ ] `/app/scenarios/[id]` показывает сценарий read-only и изолирован по `user_id` (чужой id → 404)
- [ ] Дашборд `/app` имеет кнопку «Создать сценарий» и список последних
- [ ] Реальная генерация прошла end-to-end хотя бы раз (Task 14 Step 3)
- [ ] `pnpm lint` без errors, `pnpm build` собирается
- [ ] Каждая задача — отдельный атомарный коммит

## Что НЕ делаем в этом плане (явно)

- RAG retrieval, pre-match по shared, embeddings/vector-колонки (Plan 3+)
- Стриминг SSE (Plan 4)
- Редактор: TipTap, кнопки ↑/↓, точечная регенерация активности (Plan 4+)
- Лайки, opt-in shared, библиотека сообщества (Plan 6)
- Экспорт PDF/DOCX (Plan 7)
- Загрузка файлов плана и PII-сабсистема (Plan 5)
- Rate-limit, whitelist демо-аккаунтов (Plan 8)
- Календарь поводов (Plan 6)

---

## После выполнения

Запустить планирование Plan 3 (RAG: ingest методичек + retrieval + интеграция в промпт) через `superpowers:writing-plans`.
