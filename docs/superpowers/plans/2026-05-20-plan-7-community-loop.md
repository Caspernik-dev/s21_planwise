# Plan 7 — Community-loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Замкнуть петлю сообщества: лайк сценария с opt-in шарингом (строгий повторный PII-чек) → наполнение `shared_scenarios` → pre-match похожих в `/app/new` → «использовать как есть» (копия) → страница `/app/library` с семантическим поиском → подмешивание shared-примеров в RAG-промпт генерации.

**Architecture:**
- Монолит Next.js 15 (App Router), Server Actions, Drizzle, Postgres+pgvector. Внешний GigaChat для embeddings.
- Чистая логика (PII-gate на content, фильтрация pre-match по порогу, маппинг shared→scenario, выбор цели шаринга) выносится в `lib/community/*` и покрывается unit-тестами (TDD). Серверные экшены — тонкие обёртки над чистыми функциями + БД.
- **Модель like_count (зафиксировано для MVP):** запись в `shared_scenarios` создаётся при первом opt-in лайке *оригинального* сценария (`source_shared_id IS NULL`) с `like_count = 1`. Если пользователь лайкает+шарит сценарий-копию (`source_shared_id` задан), мы НЕ создаём новую запись, а инкрементим `like_count` у исходной shared-записи. Инкремент происходит только при *переходе* лайка в состояние `opt_in_share = true` впервые — повторный лайк/шаринг тем же юзером того же сценария не задваивает (гарантируется уникальным индексом `(user_id, scenario_id)` на `likes` и флагом перехода).

**Tech Stack:** Next.js 15 / React 19, TypeScript, Drizzle ORM, Postgres 16 + pgvector, GigaChat EmbeddingsGigaR (1024d), Vitest, Biome, Tailwind + собственные shadcn-примитивы.

---

## Контекст переиспользования (НЕ переписывать)

- `lib/pii/index.ts` — `detectAndAnonymize(text)`, `detectPII(text)`, `anonymize(text, matches)`. Типы в `lib/pii/types.ts` (`PiiMatch`, `PiiType`).
- `lib/gigachat/embeddings.ts` — `embed(texts: string[]): Promise<number[][]>`.
- `lib/rag/retrieve.ts` — паттерн deps-injection + `db.execute(sql\`...\`)` с `embedding <=> ${vec}::vector`.
- `lib/rag/score.ts` — `combineScore`, `rankAndDiversify` (для RAG; pre-match по shared проще — только cosine + порог).
- `db/types.ts` — `vector` customType (`toDriver` сериализует в `[a,b,...]`).
- `lib/scenario/schema.ts` — `ScenarioContent`, `scenarioContentSchema`, `GenerationInput`, `generationInputSchema`.
- `lib/scenario/prompt.ts` — `buildMessages(input, ragChunks)`, `RagChunkForPrompt`, `PROMPT_VERSION`.
- `lib/scenario/generate.ts` — `generateScenario(input, deps)`; RAG retrieval уже встроен.
- `app/app/scenarios/[id]/actions.ts` — `loadOwned`, `saveScenarioAction`, `regenerateActivityAction`.
- `app/app/scenarios/[id]/editor.tsx` — клиентский редактор; toolbar справа сверху (PDF/DOCX/Дашборд).
- `components/nav/AppNavbar.tsx` — навигация (Создать / Планы).
- `lib/scenario/options.ts` — `DIRECTIONS`, `FORMATS`, `GRADES`, `DURATIONS`.

**Env:** `SIMILARITY_THRESHOLD` (дефолт `0.78`) — порог pre-match. `.env.local` уже скопирован в worktree.

**Baseline:** 130 pass / 3 skip. Гейты перед каждым коммитом: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

---

## File Structure

**Создаём:**
- `lib/community/serialize.ts` — `scenarioContentToText(content)`, `mapContentStrings(content, fn)` (обход всех строковых полей `ScenarioContent`).
- `lib/community/pii-gate.ts` — `anonymizeContent(content)`, `strictPiiCheck(content)` (анонимизация + повторная детекция, вердикт clean/blocked).
- `lib/community/prematch.ts` — `filterByThreshold(rows, threshold, topK)` (чистая) + `prematchShared(query, deps)` (live-запрос к shared_scenarios).
- `lib/community/share-target.ts` — `resolveShareTarget(scenario, existingLike)` (чистая: создавать новую shared-запись или инкрементить like_count исходной).
- `lib/community/copy.ts` — `sharedToScenarioInsert(shared, userId)` (чистый маппер shared→insert scenarios).
- `app/app/library/page.tsx` — серверная страница библиотеки.
- `app/app/library/search.tsx` — клиентская форма поиска + карточки.
- `app/app/library/actions.ts` — `searchSharedAction`.
- `components/community/SharedCard.tsx` — карточка shared-сценария (переиспользуется в pre-match и library).
- `components/community/LikeShareControls.tsx` — клиентский контрол лайк/шаринг в редакторе.
- Тесты: `tests/lib/community/serialize.test.ts`, `pii-gate.test.ts`, `prematch.test.ts`, `share-target.test.ts`, `copy.test.ts`, `tests/lib/scenario/prompt-examples.test.ts`, `tests/smoke/community-schema.test.ts`.

**Модифицируем:**
- `db/schema.ts` — добавить `likes`, `sharedScenarios`.
- `app/app/scenarios/[id]/actions.ts` — `likeScenarioAction`, `useSharedAsIsAction`.
- `app/app/scenarios/[id]/page.tsx` — передать в редактор состояние лайка/шаринга.
- `app/app/scenarios/[id]/editor.tsx` — встроить `LikeShareControls`.
- `app/app/new/page.tsx` + `app/app/new/actions.ts` — двухшаговый flow с pre-match.
- `lib/scenario/prompt.ts` — секция `[GOOD_EXAMPLES]`.
- `lib/scenario/generate.ts` — подтягивание top-2 shared как примеров.
- `components/nav/AppNavbar.tsx` — ссылка «Библиотека».
- `app/app/page.tsx` — карточка «Из библиотеки сообщества: N».

---

## Task 1: Схема + миграция `likes` и `shared_scenarios`

**Files:**
- Modify: `db/schema.ts`
- Create (генерируется): `db/migrations/0006_*.sql`
- Test: `tests/smoke/community-schema.test.ts`

- [ ] **Step 1: Добавить таблицы в `db/schema.ts`**

В конец `db/schema.ts` (после `ragChunks`), используя уже импортированные `boolean, integer, jsonb, pgTable, text, timestamp`, добавить `unique` к импорту из `drizzle-orm/pg-core` и `index`:

```ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ...существующее...

export const likes = pgTable(
  'likes',
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
    optInShare: boolean('opt_in_share').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('likes_user_scenario_uq').on(t.userId, t.scenarioId) }),
)

export const sharedScenarios = pgTable(
  'shared_scenarios',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceScenarioId: text('source_scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    anonymizedContent: jsonb('anonymized_content').$type<ScenarioContent>().notNull(),
    direction: text('direction').notNull(),
    grade: integer('grade').notNull(),
    durationMin: integer('duration_min').notNull(),
    format: text('format').notNull(),
    topic: text('topic').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    likeCount: integer('like_count').notNull().default(1),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUq: unique('shared_source_scenario_uq').on(t.sourceScenarioId),
    dirIdx: index('shared_direction_idx').on(t.direction),
  }),
)
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: создан `db/migrations/0006_*.sql` с `CREATE TABLE "likes"` и `CREATE TABLE "shared_scenarios"`, плюс уникальные индексы. Проверить глазами SQL — `vector(1024)` колонка присутствует.

- [ ] **Step 3: Написать smoke-тест схемы**

По образцу `tests/smoke/plans-schema.test.ts`. Тест проверяет, что объекты таблиц определены и имеют ожидаемые колонки (без обращения к БД):

```ts
import { likes, sharedScenarios } from '@/db/schema'
import { describe, expect, it } from 'vitest'

describe('community schema', () => {
  it('likes has user/scenario/optInShare columns', () => {
    expect(likes.userId).toBeDefined()
    expect(likes.scenarioId).toBeDefined()
    expect(likes.optInShare).toBeDefined()
  })
  it('sharedScenarios has anonymizedContent, embedding, likeCount', () => {
    expect(sharedScenarios.anonymizedContent).toBeDefined()
    expect(sharedScenarios.embedding).toBeDefined()
    expect(sharedScenarios.likeCount).toBeDefined()
    expect(sharedScenarios.sourceScenarioId).toBeDefined()
  })
})
```

- [ ] **Step 4: Прогнать гейты**

Run: `pnpm test` (ожидаем +2 теста, всё зелёное), `pnpm lint`, `pnpm exec tsc --noEmit`.
Если поднят Docker — `pnpm db:up && pnpm db:migrate` должны примениться без ошибок (опционально, если БД доступна).

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations tests/smoke/community-schema.test.ts
git commit -m "feat(db): add likes and shared_scenarios tables for community loop"
```

---

## Task 2: Сериализация content и обход строковых полей

**Files:**
- Create: `lib/community/serialize.ts`
- Test: `tests/lib/community/serialize.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```ts
import { mapContentStrings, scenarioContentToText } from '@/lib/community/serialize'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const sample: ScenarioContent = {
  title: 'Дружба',
  goals: ['Цель A', 'Цель B'],
  materials: ['Бумага'],
  stages: [
    {
      kind: 'engage',
      title: 'Вступление',
      duration_min: 10,
      activities: [{ type: 'discussion', text: 'Обсудим', questions: ['Вопрос?'] }],
    },
  ],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
}

describe('scenarioContentToText', () => {
  it('includes every string field', () => {
    const t = scenarioContentToText(sample)
    for (const s of ['Дружба', 'Цель A', 'Цель B', 'Бумага', 'Вступление', 'Обсудим', 'Вопрос?', 'проще', 'сложнее']) {
      expect(t).toContain(s)
    }
  })
})

describe('mapContentStrings', () => {
  it('transforms every string field and preserves structure', () => {
    const out = mapContentStrings(sample, (s) => s.toUpperCase())
    expect(out.title).toBe('ДРУЖБА')
    expect(out.goals).toEqual(['ЦЕЛЬ A', 'ЦЕЛЬ B'])
    expect(out.stages[0].activities[0].text).toBe('ОБСУДИМ')
    expect(out.stages[0].activities[0].questions).toEqual(['ВОПРОС?'])
    expect(out.adaptations.simpler).toBe('ПРОЩЕ')
    expect(out.stages[0].duration_min).toBe(10) // числа не трогаем
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `pnpm exec vitest run tests/lib/community/serialize.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `lib/community/serialize.ts`**

```ts
import type { ScenarioContent } from '@/lib/scenario/schema'

export function scenarioContentToText(content: ScenarioContent): string {
  const parts: string[] = [content.title, ...content.goals, ...content.materials]
  for (const stage of content.stages) {
    parts.push(stage.title)
    for (const a of stage.activities) {
      parts.push(a.text)
      if (a.questions) parts.push(...a.questions)
    }
  }
  parts.push(content.adaptations.simpler, content.adaptations.harder)
  return parts.join('\n')
}

export function mapContentStrings(
  content: ScenarioContent,
  fn: (s: string) => string,
): ScenarioContent {
  return {
    title: fn(content.title),
    goals: content.goals.map(fn),
    materials: content.materials.map(fn),
    stages: content.stages.map((stage) => ({
      ...stage,
      title: fn(stage.title),
      activities: stage.activities.map((a) => ({
        ...a,
        text: fn(a.text),
        questions: a.questions ? a.questions.map(fn) : a.questions,
      })),
    })),
    adaptations: {
      simpler: fn(content.adaptations.simpler),
      harder: fn(content.adaptations.harder),
    },
  }
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `pnpm exec vitest run tests/lib/community/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/community/serialize.ts tests/lib/community/serialize.test.ts
git commit -m "feat(community): add scenario content serialization helpers"
```

---

## Task 3: Строгий повторный PII-чек на content (TDD)

**Files:**
- Create: `lib/community/pii-gate.ts`
- Test: `tests/lib/community/pii-gate.test.ts`

**Контракт:** `anonymizeContent(content)` анонимизирует каждое строковое поле через `detectAndAnonymize`. `strictPiiCheck(content)` сначала анонимизирует, затем повторно прогоняет `detectPII` по сериализованному анонимизированному тексту: если что-то найдено — `{ clean: false, remaining }`, иначе `{ clean: true, anonymized }`.

- [ ] **Step 1: Написать падающие тесты**

```ts
import { anonymizeContent, strictPiiCheck } from '@/lib/community/pii-gate'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

function content(overrides: Partial<ScenarioContent> = {}): ScenarioContent {
  return {
    title: 'Тема',
    goals: ['Развивать'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Старт',
        duration_min: 10,
        activities: [{ type: 'discussion', text: 'Обсуждение' }],
      },
    ],
    adaptations: { simpler: 'a', harder: 'b' },
    ...overrides,
  }
}

describe('anonymizeContent', () => {
  it('replaces phone and email in nested fields with placeholders', () => {
    const c = content({
      stages: [
        {
          kind: 'engage',
          title: 'Звоните +7 999 123-45-67',
          duration_min: 10,
          activities: [{ type: 'discussion', text: 'Почта ivan@mail.ru' }],
        },
      ],
    })
    const out = anonymizeContent(c)
    expect(out.stages[0].title).not.toContain('+7 999 123-45-67')
    expect(out.stages[0].activities[0].text).not.toContain('ivan@mail.ru')
  })
})

describe('strictPiiCheck', () => {
  it('passes clean content', () => {
    const res = strictPiiCheck(content())
    expect(res.clean).toBe(true)
    if (res.clean) expect(res.anonymized).toBeDefined()
  })

  it('cleans contact PII so result is shareable', () => {
    const c = content({ goals: ['Позвонить ivan@mail.ru'] })
    const res = strictPiiCheck(c)
    expect(res.clean).toBe(true)
    if (res.clean) expect(JSON.stringify(res.anonymized)).not.toContain('ivan@mail.ru')
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `pnpm exec vitest run tests/lib/community/pii-gate.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `lib/community/pii-gate.ts`**

```ts
import { detectAndAnonymize, detectPII } from '@/lib/pii'
import type { PiiMatch } from '@/lib/pii'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { mapContentStrings, scenarioContentToText } from './serialize'

export function anonymizeContent(content: ScenarioContent): ScenarioContent {
  return mapContentStrings(content, (s) => detectAndAnonymize(s).anonymized)
}

export type StrictPiiResult =
  | { clean: true; anonymized: ScenarioContent }
  | { clean: false; remaining: PiiMatch[] }

export function strictPiiCheck(content: ScenarioContent): StrictPiiResult {
  const anonymized = anonymizeContent(content)
  const remaining = detectPII(scenarioContentToText(anonymized))
  if (remaining.length > 0) return { clean: false, remaining }
  return { clean: true, anonymized }
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `pnpm exec vitest run tests/lib/community/pii-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/community/pii-gate.ts tests/lib/community/pii-gate.test.ts
git commit -m "feat(community): strict PII gate over scenario content before sharing"
```

---

## Task 4: Pre-match по shared_scenarios (TDD чистой логики + live-запрос)

**Files:**
- Create: `lib/community/prematch.ts`
- Test: `tests/lib/community/prematch.test.ts`

**Контракт:** `filterByThreshold(rows, threshold, topK)` — чистая: оставляет `similarity >= threshold`, сортирует по убыванию similarity, берёт top-K. `prematchShared(query, deps)` — embed запроса, SQL по shared_scenarios с фильтрами `direction = ? AND grade BETWEEN grade-2 AND grade+2 AND format = ?`, similarity `1 - (embedding <=> qvec)`, затем `filterByThreshold`.

- [ ] **Step 1: Написать падающие тесты для чистой функции**

```ts
import { filterByThreshold } from '@/lib/community/prematch'
import { describe, expect, it } from 'vitest'

const rows = [
  { id: 'a', similarity: 0.9 },
  { id: 'b', similarity: 0.6 },
  { id: 'c', similarity: 0.8 },
  { id: 'd', similarity: 0.85 },
]

describe('filterByThreshold', () => {
  it('keeps only >= threshold, sorted desc, top-K', () => {
    const out = filterByThreshold(rows, 0.78, 3)
    expect(out.map((r) => r.id)).toEqual(['a', 'd', 'c'])
  })
  it('returns empty when nothing passes', () => {
    expect(filterByThreshold(rows, 0.95, 3)).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить — падают**

Run: `pnpm exec vitest run tests/lib/community/prematch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `lib/community/prematch.ts`**

```ts
import { db } from '@/db'
import { embed as gigaEmbed } from '@/lib/gigachat/embeddings'
import { sql } from 'drizzle-orm'

export type PrematchQuery = {
  direction: string
  grade: number
  topic: string
  format: string
}

export type SharedMatch = {
  id: string
  title: string
  direction: string
  grade: number
  format: string
  topic: string
  likeCount: number
  anonymizedContent: unknown
  similarity: number
}

export function filterByThreshold<T extends { similarity: number }>(
  rows: T[],
  threshold: number,
  topK: number,
): T[] {
  return rows
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

export type PrematchDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  queryRows: (qvec: number[], q: PrematchQuery, gradeSpan: number) => Promise<SharedMatch[]>
  threshold: number
  topK: number
  gradeSpan: number
}

async function queryRowsLive(
  qvec: number[],
  q: PrematchQuery,
  gradeSpan: number,
): Promise<SharedMatch[]> {
  const vec = `[${qvec.join(',')}]`
  const rows = await db.execute(sql`
    SELECT id, direction, grade, format, topic, like_count AS "likeCount",
      anonymized_content AS "anonymizedContent",
      anonymized_content->>'title' AS title,
      (1 - (embedding <=> ${vec}::vector)) AS similarity
    FROM shared_scenarios
    WHERE direction = ${q.direction}
      AND format = ${q.format}
      AND grade BETWEEN ${q.grade - gradeSpan} AND ${q.grade + gradeSpan}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT 20
  `)
  return (rows as unknown as SharedMatch[]).map((r) => ({ ...r, similarity: Number(r.similarity) }))
}

function defaults(): PrematchDeps {
  return {
    embed: gigaEmbed,
    queryRows: queryRowsLive,
    threshold: Number(process.env.SIMILARITY_THRESHOLD ?? '0.78'),
    topK: 3,
    gradeSpan: 2,
  }
}

export async function prematchShared(
  q: PrematchQuery,
  deps: Partial<PrematchDeps> = {},
): Promise<SharedMatch[]> {
  const d = { ...defaults(), ...deps }
  const [qvec] = await d.embed([`${q.direction} ${q.grade} ${q.topic} ${q.format}`.trim()])
  if (!qvec) return []
  const rows = await d.queryRows(qvec, q, d.gradeSpan)
  return filterByThreshold(rows, d.threshold, d.topK)
}
```

- [ ] **Step 4: Добавить тест на `prematchShared` с моками deps**

Дописать в тот же файл:

```ts
import { prematchShared } from '@/lib/community/prematch'

describe('prematchShared', () => {
  it('embeds query and applies threshold/topK over injected rows', async () => {
    const out = await prematchShared(
      { direction: 'Гражданское', grade: 5, topic: 'дружба', format: 'беседа' },
      {
        embed: async () => [[0.1, 0.2]],
        queryRows: async () => [
          { id: 'x', title: 'X', direction: 'Гражданское', grade: 5, format: 'беседа', topic: 'дружба', likeCount: 3, anonymizedContent: {}, similarity: 0.91 },
          { id: 'y', title: 'Y', direction: 'Гражданское', grade: 6, format: 'беседа', topic: 'дружба', likeCount: 1, anonymizedContent: {}, similarity: 0.5 },
        ],
        threshold: 0.78,
        topK: 3,
        gradeSpan: 2,
      },
    )
    expect(out.map((r) => r.id)).toEqual(['x'])
  })
})
```

- [ ] **Step 5: Запустить — зелёные**

Run: `pnpm exec vitest run tests/lib/community/prematch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/community/prematch.ts tests/lib/community/prematch.test.ts
git commit -m "feat(community): pre-match search over shared_scenarios with threshold"
```

---

## Task 5: Логика выбора цели шаринга (TDD)

**Files:**
- Create: `lib/community/share-target.ts`
- Test: `tests/lib/community/share-target.test.ts`

**Контракт:** определяет, что делать при opt-in шаринге, на основе сценария и текущего состояния лайка. Реализует модель like_count из шапки плана.

- [ ] **Step 1: Написать падающие тесты**

```ts
import { resolveShareTarget } from '@/lib/community/share-target'
import { describe, expect, it } from 'vitest'

describe('resolveShareTarget', () => {
  it('creates new shared row for original scenario, first share', () => {
    const r = resolveShareTarget(
      { sourceSharedId: null },
      { alreadyShared: false },
    )
    expect(r).toEqual({ action: 'create' })
  })

  it('increments source shared like_count for a copy, first share', () => {
    const r = resolveShareTarget(
      { sourceSharedId: 'shared-1' },
      { alreadyShared: false },
    )
    expect(r).toEqual({ action: 'increment', sharedId: 'shared-1' })
  })

  it('does nothing if this scenario was already shared by this user', () => {
    const r = resolveShareTarget(
      { sourceSharedId: 'shared-1' },
      { alreadyShared: true },
    )
    expect(r).toEqual({ action: 'noop' })
  })
})
```

- [ ] **Step 2: Запустить — падают**

Run: `pnpm exec vitest run tests/lib/community/share-target.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `lib/community/share-target.ts`**

```ts
export type ShareTarget =
  | { action: 'create' }
  | { action: 'increment'; sharedId: string }
  | { action: 'noop' }

export function resolveShareTarget(
  scenario: { sourceSharedId: string | null },
  like: { alreadyShared: boolean },
): ShareTarget {
  if (like.alreadyShared) return { action: 'noop' }
  if (scenario.sourceSharedId) return { action: 'increment', sharedId: scenario.sourceSharedId }
  return { action: 'create' }
}
```

- [ ] **Step 4: Запустить — зелёные**

Run: `pnpm exec vitest run tests/lib/community/share-target.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/community/share-target.ts tests/lib/community/share-target.test.ts
git commit -m "feat(community): resolve share target (create vs increment vs noop)"
```

---

## Task 6: Server action — лайк + opt-in шаринг

**Files:**
- Modify: `app/app/scenarios/[id]/actions.ts`
- (Тест — на чистые части уже покрыто T3/T5; экшен проверяется lint/tsc/build + ручной UAT.)

- [ ] **Step 1: Добавить `likeScenarioAction` в `app/app/scenarios/[id]/actions.ts`**

Добавить импорты (`likes`, `sharedScenarios` из схемы; `strictPiiCheck`; `resolveShareTarget`; `embed`):

```ts
import { generations, likes, scenarioVersions, scenarios, sharedScenarios } from '@/db/schema'
import { strictPiiCheck } from '@/lib/community/pii-gate'
import { resolveShareTarget } from '@/lib/community/share-target'
```

Затем экшен:

```ts
export type LikeResult =
  | { ok: true; liked: boolean; shared: boolean }
  | { ok: false; error: string; piiBlocked?: boolean }

export async function likeScenarioAction(
  scenarioId: string,
  optInShare: boolean,
): Promise<LikeResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const [existing] = await db
    .select({ id: likes.id, optInShare: likes.optInShare })
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.scenarioId, scenarioId)))
    .limit(1)

  // PII-gate ДО любых записей в shared
  let anonymized = null as Awaited<ReturnType<typeof strictPiiCheck>> | null
  if (optInShare) {
    const check = strictPiiCheck(owned.content)
    if (!check.clean) {
      const kinds = Array.from(new Set(check.remaining.map((m) => m.type))).join(', ')
      return {
        ok: false,
        piiBlocked: true,
        error: `Найдены персональные данные (${kinds}). Уберите их вручную в тексте перед публикацией.`,
      }
    }
    anonymized = check
  }

  // upsert лайка
  if (existing) {
    await db
      .update(likes)
      .set({ optInShare: optInShare || existing.optInShare })
      .where(eq(likes.id, existing.id))
  } else {
    await db.insert(likes).values({ userId, scenarioId, optInShare })
  }

  let shared = false
  if (optInShare && anonymized?.clean) {
    const target = resolveShareTarget(
      { sourceSharedId: owned.sourceSharedId },
      { alreadyShared: existing?.optInShare ?? false },
    )
    if (target.action === 'increment') {
      await db
        .update(sharedScenarios)
        .set({ likeCount: sql`${sharedScenarios.likeCount} + 1` })
        .where(eq(sharedScenarios.id, target.sharedId))
      shared = true
    } else if (target.action === 'create') {
      let vec: number[] | null = null
      try {
        const { embed } = await import('@/lib/gigachat/embeddings')
        const text = `${owned.direction} ${owned.topic} ${anonymized.anonymized.title}`
        ;[vec] = await embed([text])
      } catch (e) {
        console.error('shared embedding failed (non-fatal):', e)
      }
      const [row] = await db
        .insert(sharedScenarios)
        .values({
          sourceScenarioId: scenarioId,
          anonymizedContent: anonymized.anonymized,
          direction: owned.direction,
          grade: owned.grade,
          durationMin: owned.durationMin,
          format: owned.format,
          topic: owned.topic,
          likeCount: 1,
        })
        .returning({ id: sharedScenarios.id })
      if (vec && row) {
        await db.execute(
          sql`UPDATE shared_scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${row.id}`,
        )
      }
      shared = true
    }
  }

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true, liked: true, shared }
}
```

> Примечание: `sql` уже импортирован? В файле сейчас импорт `import { and, eq } from 'drizzle-orm'`. Добавить `sql`: `import { and, eq, sql } from 'drizzle-orm'`.

- [ ] **Step 2: Гейты**

Run: `pnpm exec tsc --noEmit` (типы экшена сходятся), `pnpm lint`, `pnpm test` (без регрессий).
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/[id]/actions.ts
git commit -m "feat(community): like + opt-in share action with strict PII gate"
```

---

## Task 7: UI лайка/шаринга в редакторе

**Files:**
- Create: `components/community/LikeShareControls.tsx`
- Modify: `app/app/scenarios/[id]/page.tsx`, `app/app/scenarios/[id]/editor.tsx`

- [ ] **Step 1: Прокинуть состояние лайка в страницу**

В `app/app/scenarios/[id]/page.tsx` после загрузки `scenario` добавить запрос лайка и передать в редактор:

```ts
import { likes } from '@/db/schema'
// ...
const [like] = await db
  .select({ optInShare: likes.optInShare })
  .from(likes)
  .where(and(eq(likes.userId, session.user.id), eq(likes.scenarioId, id)))
  .limit(1)
// ...
<ScenarioEditor
  meta={{ /* ...как было... */ }}
  initialContent={scenario.content}
  initialLiked={!!like}
  initialShared={like?.optInShare ?? false}
/>
```

- [ ] **Step 2: Создать `components/community/LikeShareControls.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { useState, useTransition } from 'react'
import { likeScenarioAction } from '@/app/app/scenarios/[id]/actions'

export function LikeShareControls({
  scenarioId,
  initialLiked,
  initialShared,
}: { scenarioId: string; initialLiked: boolean; initialShared: boolean }) {
  const [liked, setLiked] = useState(initialLiked)
  const [shared, setShared] = useState(initialShared)
  const [optIn, setOptIn] = useState(initialShared)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function submit() {
    setMsg(null)
    start(async () => {
      const res = await likeScenarioAction(scenarioId, optIn)
      if (res.ok) {
        setLiked(true)
        setShared(res.shared)
        setMsg(res.shared ? 'Опубликовано в библиотеке сообщества' : 'Сохранено в избранном')
      } else {
        setMsg(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Поделиться с сообществом
        </label>
        <Button type="button" size="sm" variant={liked ? 'default' : 'outline'} disabled={pending} onClick={submit}>
          {liked ? (shared ? '❤ В библиотеке' : '❤ Нравится') : '♡ Нравится'}
        </Button>
      </div>
      {msg && <p className="max-w-xs text-right text-xs text-neutral-500">{msg}</p>}
    </div>
  )
}
```

> Проверить вариант `variant` у `Button` (`default`/`outline`) по `components/ui/button.tsx`; если значения иные — подставить корректные.

- [ ] **Step 3: Встроить в `editor.tsx`**

Расширить тип props `ScenarioEditor` (`initialLiked`, `initialShared`) и отрендерить `LikeShareControls` в правом toolbar рядом с PDF/DOCX. Импорт: `import { LikeShareControls } from '@/components/community/LikeShareControls'`. Добавить в блок toolbar:

```tsx
<LikeShareControls scenarioId={meta.id} initialLiked={initialLiked} initialShared={initialShared} />
```

- [ ] **Step 4: Гейты + ручная проверка**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
Ручной UAT (если поднята БД+ключ): открыть сценарий → отметить «Поделиться» → Нравится → ожидать «Опубликовано». Повторный клик не задваивает like_count.

- [ ] **Step 5: Commit**

```bash
git add components/community/LikeShareControls.tsx app/app/scenarios/[id]/page.tsx app/app/scenarios/[id]/editor.tsx
git commit -m "feat(community): like/share controls in scenario editor"
```

---

## Task 8: «Использовать как есть» = копия (TDD маппера + action)

**Files:**
- Create: `lib/community/copy.ts`
- Test: `tests/lib/community/copy.test.ts`
- Modify: `app/app/scenarios/[id]/actions.ts`

- [ ] **Step 1: Написать падающие тесты для маппера**

```ts
import { sharedToScenarioInsert } from '@/lib/community/copy'
import { describe, expect, it } from 'vitest'

const shared = {
  id: 'shared-1',
  anonymizedContent: { title: 'Дружба', goals: ['g'], materials: [], stages: [], adaptations: { simpler: 'a', harder: 'b' } },
  direction: 'Гражданское',
  grade: 5,
  durationMin: 30,
  format: 'беседа',
  topic: 'дружба',
}

describe('sharedToScenarioInsert', () => {
  it('maps shared into a personal scenario insert with source_shared_id', () => {
    const ins = sharedToScenarioInsert(shared as never, 'user-1')
    expect(ins.userId).toBe('user-1')
    expect(ins.sourceSharedId).toBe('shared-1')
    expect(ins.title).toBe('Дружба')
    expect(ins.direction).toBe('Гражданское')
    expect(ins.content).toEqual(shared.anonymizedContent)
    expect(ins.inputContext).toEqual({
      direction: 'Гражданское',
      grade: 5,
      topic: 'дружба',
      durationMin: 30,
      format: 'беседа',
    })
  })
})
```

- [ ] **Step 2: Запустить — падают**

Run: `pnpm exec vitest run tests/lib/community/copy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `lib/community/copy.ts`**

```ts
import type { GenerationInput, ScenarioContent } from '@/lib/scenario/schema'

export type SharedRow = {
  id: string
  anonymizedContent: ScenarioContent
  direction: string
  grade: number
  durationMin: number
  format: string
  topic: string
}

export function sharedToScenarioInsert(shared: SharedRow, userId: string) {
  const inputContext: GenerationInput = {
    direction: shared.direction as GenerationInput['direction'],
    grade: shared.grade,
    topic: shared.topic,
    durationMin: shared.durationMin,
    format: shared.format as GenerationInput['format'],
  }
  return {
    userId,
    title: shared.anonymizedContent.title,
    direction: shared.direction,
    grade: shared.grade,
    durationMin: shared.durationMin,
    format: shared.format,
    topic: shared.topic,
    sourceSharedId: shared.id,
    content: shared.anonymizedContent,
    inputContext,
  }
}
```

- [ ] **Step 4: Запустить — зелёные**

Run: `pnpm exec vitest run tests/lib/community/copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Добавить `useSharedAsIsAction` в `app/app/scenarios/[id]/actions.ts`**

```ts
import { sharedToScenarioInsert, type SharedRow } from '@/lib/community/copy'

export async function useSharedAsIsAction(sharedId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [shared] = await db
    .select({
      id: sharedScenarios.id,
      anonymizedContent: sharedScenarios.anonymizedContent,
      direction: sharedScenarios.direction,
      grade: sharedScenarios.grade,
      durationMin: sharedScenarios.durationMin,
      format: sharedScenarios.format,
      topic: sharedScenarios.topic,
    })
    .from(sharedScenarios)
    .where(eq(sharedScenarios.id, sharedId))
    .limit(1)
  if (!shared) redirect('/app/library')

  const [row] = await db
    .insert(scenarios)
    .values(sharedToScenarioInsert(shared as SharedRow, userId))
    .returning({ id: scenarios.id })
  await db.insert(scenarioVersions).values({ scenarioId: row.id, content: shared.anonymizedContent })

  redirect(`/app/scenarios/${row.id}`)
}
```

> `shared_scenarios` доступен всем (это библиотека сообщества), поэтому здесь намеренно НЕТ `WHERE user_id` — это не пользовательская таблица. Запись-копия создаётся под текущего `userId`.

- [ ] **Step 6: Гейты + commit**

Run: `pnpm exec vitest run tests/lib/community/copy.test.ts`, `pnpm exec tsc --noEmit`, `pnpm lint`.

```bash
git add lib/community/copy.ts tests/lib/community/copy.test.ts app/app/scenarios/[id]/actions.ts
git commit -m "feat(community): use-shared-as-is creates a personal copy"
```

---

## Task 9: Карточка shared + pre-match в `/app/new`

**Files:**
- Create: `components/community/SharedCard.tsx`
- Modify: `app/app/new/actions.ts`, `app/app/new/page.tsx`

- [ ] **Step 1: Создать `components/community/SharedCard.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTransition } from 'react'
import { useSharedAsIsAction } from '@/app/app/scenarios/[id]/actions'

type StagePreview = { title: string }

export function SharedCard({
  id,
  title,
  direction,
  format,
  likeCount,
  stages,
}: {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: StagePreview[]
}) {
  const [pending, start] = useTransition()
  return (
    <Card className="ring-1 ring-neutral-200 shadow-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {[direction, format, `❤ ${likeCount}`].map((b) => (
            <span key={b} className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">
              {b}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-neutral-600">
          {stages.slice(0, 3).map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: preview list, no stable id
            <li key={`st-${i}`}>{s.title}</li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => start(() => useSharedAsIsAction(id))}
        >
          {pending ? 'Копируем…' : 'Использовать как есть'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Добавить `prematchAction` в `app/app/new/actions.ts`**

```ts
import { prematchShared } from '@/lib/community/prematch'

export type PrematchCard = {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: Array<{ title: string }>
}

export async function prematchAction(formData: FormData): Promise<PrematchCard[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const parsed = generationInputSchema.safeParse({
    direction: formData.get('direction'),
    grade: formData.get('grade'),
    topic: formData.get('topic'),
    durationMin: formData.get('durationMin'),
    format: formData.get('format'),
  })
  if (!parsed.success) return []
  const i = parsed.data
  try {
    const matches = await prematchShared({
      direction: i.direction,
      grade: i.grade,
      topic: i.topic,
      format: i.format,
    })
    return matches.map((m) => ({
      id: m.id,
      title: m.title,
      direction: m.direction,
      format: m.format,
      likeCount: m.likeCount,
      stages: ((m.anonymizedContent as { stages?: Array<{ title: string }> }).stages ?? []).map(
        (s) => ({ title: s.title }),
      ),
    }))
  } catch (e) {
    console.error('prematchAction failed (non-fatal):', e)
    return []
  }
}
```

- [ ] **Step 3: Двухшаговый flow в `app/app/new/page.tsx`**

Между сабмитом и генерацией: при нажатии «Подобрать / Сгенерировать» сначала вызывать `prematchAction`; если есть карточки — показать Step 2 (карточки + кнопка «Сгенерировать новый»), иначе сразу запускать `generateScenarioAction`. Реализация: добавить локальный state `matches: PrematchCard[] | null`, кнопку основного действия заменить на «Подобрать похожие», после ответа prematch:
- если `matches.length > 0` → рендерить секцию `<SharedCard .../>` + кнопку «Сгенерировать новый» (которая сабмитит на `generateScenarioAction` через тот же `formAction`);
- если пусто → сразу сабмитить генерацию.

Сохранить текущую `useActionState(generateScenarioAction)` для самой генерации; pre-match выполнять отдельным `useTransition` + ручным `prematchAction(new FormData(formRef.current))`. Форму обернуть в `ref`. Скелет:

```tsx
const formRef = useRef<HTMLFormElement>(null)
const [matches, setMatches] = useState<PrematchCard[] | null>(null)
const [matching, startMatch] = useTransition()

function onPrematch() {
  const fd = new FormData(formRef.current!)
  startMatch(async () => {
    const found = await prematchAction(fd)
    if (found.length === 0) {
      formRef.current?.requestSubmit() // сразу генерируем
    } else {
      setMatches(found)
    }
  })
}
```

Кнопка генерации (`formAction`) остаётся как «Сгенерировать новый» в Step 2; основная кнопка Step 1 вызывает `onPrematch`. Текст бейджа приватности у формы не трогаем.

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
Expected: зелёное. Ручной UAT (с БД): заполнить форму с темой, по которой есть shared → увидеть карточки; «Использовать как есть» создаёт копию и открывает редактор; «Сгенерировать новый» запускает генерацию.

- [ ] **Step 5: Commit**

```bash
git add components/community/SharedCard.tsx app/app/new/actions.ts app/app/new/page.tsx
git commit -m "feat(community): pre-match cards in /app/new with use-as-is and generate-new"
```

---

## Task 10: Страница `/app/library` с семантическим поиском

**Files:**
- Create: `app/app/library/page.tsx`, `app/app/library/actions.ts`, `app/app/library/search.tsx`
- Modify: `components/nav/AppNavbar.tsx`

- [ ] **Step 1: `app/app/library/actions.ts`**

```ts
'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { embed } from '@/lib/gigachat/embeddings'
import { filterByThreshold } from '@/lib/community/prematch'
import { sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export type LibraryCard = {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: Array<{ title: string }>
}

export async function searchSharedAction(query: string): Promise<LibraryCard[]> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const q = query.trim()

  // Пустой запрос → топ по популярности
  if (q.length === 0) {
    const rows = await db.execute(sql`
      SELECT id, like_count AS "likeCount", direction, format,
        anonymized_content AS "content", anonymized_content->>'title' AS title
      FROM shared_scenarios
      ORDER BY like_count DESC, created_at DESC
      LIMIT 24
    `)
    return (rows as unknown as Array<Record<string, unknown>>).map(toCard)
  }

  let qvec: number[] | null = null
  try {
    ;[qvec] = await embed([q])
  } catch (e) {
    console.error('library embed failed:', e)
  }
  if (!qvec) return []
  const vec = `[${qvec.join(',')}]`
  const rows = await db.execute(sql`
    SELECT id, like_count AS "likeCount", direction, format,
      anonymized_content AS "content", anonymized_content->>'title' AS title,
      (1 - (embedding <=> ${vec}::vector)) AS similarity
    FROM shared_scenarios
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT 24
  `)
  const mapped = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    ...toCard(r),
    similarity: Number(r.similarity),
  }))
  // мягкий порог чуть ниже pre-match, чтобы поиск возвращал результаты
  const threshold = Number(process.env.LIBRARY_SIMILARITY_THRESHOLD ?? '0.5')
  return filterByThreshold(mapped, threshold, 24)
}

function toCard(r: Record<string, unknown>): LibraryCard {
  const content = r.content as { stages?: Array<{ title: string }> }
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    direction: String(r.direction),
    format: String(r.format),
    likeCount: Number(r.likeCount),
    stages: (content.stages ?? []).map((s) => ({ title: s.title })),
  }
}
```

- [ ] **Step 2: `app/app/library/search.tsx` (клиент)**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SharedCard } from '@/components/community/SharedCard'
import { useEffect, useState, useTransition } from 'react'
import { type LibraryCard, searchSharedAction } from './actions'

export function LibrarySearch({ initial }: { initial: LibraryCard[] }) {
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<LibraryCard[]>(initial)
  const [pending, start] = useTransition()

  function run() {
    start(async () => setCards(await searchSharedAction(q)))
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Опишите тему: например, профориентация для 8 класса"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button type="button" onClick={run} disabled={pending}>
          {pending ? 'Ищем…' : 'Найти'}
        </Button>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-neutral-500">Ничего не найдено. Попробуйте другой запрос.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <SharedCard key={c.id} {...c} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `app/app/library/page.tsx` (сервер)**

```tsx
import { LibrarySearch } from './search'
import { searchSharedAction } from './actions'

export default async function LibraryPage() {
  const initial = await searchSharedAction('') // топ по популярности
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-neutral-900">Библиотека сообщества</h1>
      <p className="text-sm text-neutral-600">
        Готовые сценарии, которыми поделились коллеги. «Использовать как есть» создаёт вашу личную копию.
      </p>
      <LibrarySearch initial={initial} />
    </div>
  )
}
```

- [ ] **Step 4: Ссылка в `components/nav/AppNavbar.tsx`**

Добавить между «Создать» и «Планы»:

```tsx
<Link href="/app/library" className="hover:text-neutral-900">
  Библиотека
</Link>
```

- [ ] **Step 5: Гейты + commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

```bash
git add app/app/library components/nav/AppNavbar.tsx
git commit -m "feat(community): /app/library semantic search page"
```

---

## Task 11: Подмешивание shared как GOOD_EXAMPLES в RAG-промпт (TDD)

**Files:**
- Modify: `lib/scenario/prompt.ts`, `lib/scenario/generate.ts`
- Test: `tests/lib/scenario/prompt-examples.test.ts`

- [ ] **Step 1: Написать падающий тест для prompt builder**

```ts
import { buildMessages } from '@/lib/scenario/prompt'
import type { GenerationInput } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const input: GenerationInput = {
  direction: 'Гражданское',
  grade: 5,
  topic: 'дружба',
  durationMin: 30,
  format: 'беседа',
}

describe('buildMessages GOOD_EXAMPLES', () => {
  it('renders shared examples block when provided', () => {
    const msgs = buildMessages(input, [], [{ title: 'Пример', summary: 'Этапы: вступление, основа, рефлексия' }])
    const user = msgs.find((m) => m.role === 'user')!
    expect(user.content).toContain('GOOD_EXAMPLES')
    expect(user.content).toContain('Пример')
  })
  it('omits block when no examples', () => {
    const msgs = buildMessages(input, [])
    const user = msgs.find((m) => m.role === 'user')!
    expect(user.content).not.toContain('GOOD_EXAMPLES')
  })
})
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-examples.test.ts`
Expected: FAIL (третий аргумент не поддерживается).

- [ ] **Step 3: Расширить `lib/scenario/prompt.ts`**

Добавить тип и параметр:

```ts
export type SharedExampleForPrompt = { title: string; summary: string }

export function buildMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
): ChatMessage[] {
  // ...system без изменений...

  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег по похожим темам — ориентир по структуре, не копируй текст):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const user = [
    'Сгенерируй сценарий внеурочного занятия со следующими параметрами:',
    `- Направление воспитания: ${input.direction}`,
    `- Класс: ${input.grade}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    ...methodology,
    ...examples,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
```

- [ ] **Step 4: Запустить — зелёные**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-examples.test.ts`
Expected: PASS.

- [ ] **Step 5: Подтянуть shared в `lib/scenario/generate.ts`**

После RAG retrieval добавить (best-effort, не валит генерацию):

```ts
import { prematchShared } from '@/lib/community/prematch'
import type { SharedExampleForPrompt } from './prompt'
// ...
let sharedExamples: SharedExampleForPrompt[] = []
try {
  const matches = await prematchShared(
    { direction: input.direction, grade: input.grade, topic: input.topic, format: input.format },
    { topK: 2 },
  )
  sharedExamples = matches.map((m) => ({
    title: m.title,
    summary: ((m.anonymizedContent as { stages?: Array<{ title: string }> }).stages ?? [])
      .map((s) => s.title)
      .join(' → '),
  }))
} catch (e) {
  console.error('shared examples fetch failed (non-fatal):', e)
}

const messages = buildMessages(input, ragChunks, sharedExamples)
```

> `prematchShared` принимает `deps.topK`; здесь переопределяем topK=2, остальное — дефолты. Порог тот же `SIMILARITY_THRESHOLD`.

- [ ] **Step 6: Гейты + commit**

Run: `pnpm test` (включая новый тест), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

```bash
git add lib/scenario/prompt.ts lib/scenario/generate.ts tests/lib/scenario/prompt-examples.test.ts
git commit -m "feat(community): mix shared scenarios as GOOD_EXAMPLES into RAG prompt"
```

---

## Task 12: Карточка сообщества на дашборде + холистическое ревью + тег

**Files:**
- Modify: `app/app/page.tsx`, `CLAUDE.md`

- [ ] **Step 1: Карточка «Из библиотеки сообщества: N» в `app/app/page.tsx`**

Добавить count и карточку-ссылку на `/app/library`:

```ts
import { sharedScenarios } from '@/db/schema'
import { count } from 'drizzle-orm'
// ...
const [{ value: sharedCount }] = await db
  .select({ value: count() })
  .from(sharedScenarios)
```

Над списком сценариев добавить ссылку-карточку (рядом с заголовком или в сетке планов):

```tsx
<Link href="/app/library">
  <Card className="transition hover:shadow-hover">
    <CardHeader>
      <CardTitle className="text-base">Библиотека сообщества</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-neutral-600">{sharedCount} сценариев</CardContent>
  </Card>
</Link>
```

- [ ] **Step 2: Гейты**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
Expected: всё зелёное; финальный baseline ≈ 130 + новые unit-тесты (serialize/pii-gate/prematch/share-target/copy/prompt-examples + schema smoke).

- [ ] **Step 3: Commit**

```bash
git add app/app/page.tsx
git commit -m "feat(community): dashboard community library card"
```

- [ ] **Step 4: Холистическое code-review + security-review**

Через `superpowers:requesting-code-review` (cross-cutting проверка всей фазы) и `security-review`. Особое внимание:
- PII-gate действительно блокирует opt-in при остаточных совпадениях (нет пути в shared без чистого вердикта).
- `shared_scenarios` читается без `user_id`-фильтра намеренно (публичная), но запись-копия и лайки строго под `session.user.id`; никаких пользовательских выборок без `WHERE user_id`.
- like_count не задваивается при повторном лайке/шаринге.
- Параметризованные запросы (нет конкатенации строк в SQL, кроме сериализации вектора через `::vector`).
Найденные проблемы — чинить отдельными коммитами.

- [ ] **Step 5: Тег**

```bash
git tag community-loop-done
```

- [ ] **Step 6: Обновить раздел «Статус реализации» в `CLAUDE.md`**

Добавить запись Plan 7 «Community-loop — ГОТОВ» (ветка `feat/community-loop`, тег `community-loop-done`): что реализовано (likes+shared таблицы, строгий PII-gate, pre-match, use-as-is копия, /app/library, shared в RAG-промпте), гейты зелёные, и техдолг (live-калибровка `SIMILARITY_THRESHOLD`, rate-limit на `/app/library` поиск — в Plan 8). Закоммитить:

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): record Plan 7 (community-loop) done status"
```

---

## Self-Review (covered)

- **Spec §5[3] pre-match** → Task 4 (prematch) + Task 9 (UI карточки в /app/new).
- **Spec §5[9] like opt-in + повторный PII** → Task 3 (gate) + Task 6 (action) + Task 7 (UI).
- **Spec §6 точка 3 строгий PII-чек** → Task 3, блокировка в Task 6.
- **Spec §4 копия с source_shared_id** → Task 8.
- **Spec §4 like_count агрегируется + дедуп** → Task 1 (unique index) + Task 5 (target) + Task 6 (transition guard).
- **Spec §7 «2 примера из shared» в RAG** → Task 11.
- **Spec §8 /app/library семантический поиск** → Task 10.
- **Spec §8 карточка «Из библиотеки сообщества: N»** → Task 12.
- **Изоляция данных (jury)** → проверка в Task 12 Step 4; shared — публичная, всё остальное под user_id.

**Out of this phase:** live-калибровка порога (ручной шаг перед демо), rate-limit на поиск (Plan 8), стриминг генерации (отдельная фаза).
