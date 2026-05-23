# РоВ-уровень генерации через per-block пайплайн — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять объём и качество генерируемых сценариев до уровня методичек «Разговоры о важном» (~15-18 КБ) за счёт дробления генерации до уровня одного блока, контент-плана в каркасе, катящегося контекста и детерминированного per-block гейта качества.

**Architecture:** Каркас (1 стрим-вызов) теперь несёт контент-план — список «брифов блоков» на каждый этап. Затем цикл по блокам: на каждый бриф — отдельный фокусный вызов GigaChat (насыщает ~800 ток. на ОДИН блок вместо целого этапа), с прокидыванием RAG-чанков блока и катящейся сводки уже готовых блоков; локальный гейт перегенерирует тонкие блоки. Сборка → нормализация → save. Всё через инъекцию зависимостей — юнит-тесты без сети/БД.

**Tech Stack:** Next.js 15, TypeScript, Drizzle (Postgres+pgvector), Vitest, GigaChat (SSE), zod.

**Спека:** `docs/superpowers/specs/2026-05-23-rov-quality-blocks-design.md`
**Базис:** ветка от `master`. Конвенции CLAUDE.md: один коммит на задачу; TDD для чистой логики; гейты зелёные перед коммитом (`pnpm test`, `pnpm lint`, `tsc --noEmit`, `pnpm build`); UI на русском; юнит-тесты не ходят в сеть/БД.

---

## Карта файлов

- `lib/scenario/schema.ts` — **modify**: `blocks` (контент-план) в этап каркаса; удалить `stageActivitiesSchema`; расширить `GenerationMeta`.
- `lib/scenario/context.ts` — **create**: `buildRunningContext` (катящаяся сводка готовых блоков, чистая).
- `lib/scenario/quality.ts` — **create**: `checkBlock` (per-block пороги) + `checkScenario` (сводные warnings), чистые.
- `lib/scenario/prompt.ts` — **modify**: `buildSkeletonMessages` требует контент-план; новый `buildBlockMessages`; удалить `buildStageDetailsMessages`/`buildDetailsMessages`; `PROMPT_VERSION → v6-rov-blocks-2026-05-23`.
- `lib/scenario/stream.ts` — **modify**: per-block цикл с контекстом и гейтом; событие `block`.
- `components/generation/GenerationStream.tsx` — **modify**: прогресс per-block.
- Тесты: `tests/lib/scenario/context.test.ts` (create), `tests/lib/scenario/quality.test.ts` (create), `tests/lib/scenario/prompt.test.ts` (modify), `tests/lib/scenario/prompt-stream.test.ts` (modify/remove), `tests/lib/scenario/stream.test.ts` (modify).

**НЕ трогаем:** `lib/scenario/generate.ts` + `buildMessages` (используются `scripts/gen-seed.ts`); `lib/scenario/regenerate.ts` (точечная 🎲 — вне scope); `scripts/seed-shared.ts` (потребляет `streamScenario` обобщённо, новые события игнорирует — наследует пайплайн без правок); `chunksForStage` (переиспользуется как есть).

---

## Task 1: Схема — контент-план блоков в каркасе

**Files:**
- Modify: `lib/scenario/schema.ts`
- Test: `tests/lib/scenario/schema-blocks.test.ts` (create)

- [ ] **Step 1: Написать падающий тест**

Создать `tests/lib/scenario/schema-blocks.test.ts`:

```typescript
import { skeletonSchema } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

describe('skeletonSchema with blocks', () => {
  it('принимает этапы с контент-планом blocks', () => {
    const r = skeletonSchema.safeParse({
      title: 'Дружба',
      goals: ['ценность дружбы'],
      stages: [
        {
          kind: 'main',
          title: 'Основа',
          duration_min: 10,
          blocks: [
            { type: 'discussion', focus: 'что такое настоящая дружба' },
            { type: 'game', focus: 'игра на доверие' },
          ],
        },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.stages[0].blocks).toHaveLength(2)
  })

  it('blocks опциональны (этап без плана валиден)', () => {
    const r = skeletonSchema.safeParse({
      title: 'X',
      goals: ['g'],
      stages: [{ kind: 'engage', title: 'Старт', duration_min: 5 }],
    })
    expect(r.success).toBe(true)
  })

  it('отбрасывает бриф без focus', () => {
    const r = skeletonSchema.safeParse({
      title: 'X',
      goals: ['g'],
      stages: [{ kind: 'main', title: 'M', duration_min: 5, blocks: [{ type: 'discussion' }] }],
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm exec vitest run tests/lib/scenario/schema-blocks.test.ts`
Expected: FAIL (`blocks` ещё нет в схеме / тип не определён).

- [ ] **Step 3: Реализовать изменения схемы**

В `lib/scenario/schema.ts` добавить схему брифа и поле `blocks`. Заменить блок `skeletonStageSchema` (строки ~43-47) на:

```typescript
export const skeletonBlockSchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  focus: z.string().min(1),
})

export const skeletonStageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.coerce.number().int().min(0),
  blocks: z.array(skeletonBlockSchema).min(1).optional(),
})

export type SkeletonBlock = z.infer<typeof skeletonBlockSchema>
```

Удалить блок `stageActivitiesSchema` (строки ~59-62):

```typescript
// Схема ответа per-stage генерации: только активности одного этапа.
export const stageActivitiesSchema = z.object({
  activities: z.array(activitySchema).min(1),
})
```

Расширить `GenerationMeta` (добавить два опциональных поля после `usedChunkIds`):

```typescript
export type GenerationMeta = {
  model: string
  promptVersion: string
  repaired: boolean
  normalized: boolean
  usage: { promptTokens: number; completionTokens: number } | null
  latencyMs: number
  usedChunkIds: string[]
  thinBlocks?: number
  qualityWarnings?: string[]
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm exec vitest run tests/lib/scenario/schema-blocks.test.ts`
Expected: PASS (3 теста).

Примечание: на этом шаге `pnpm tsc --noEmit` временно покажет ошибки в `stream.ts` (использует `stageActivitiesSchema`) — это чинится в Task 5. Коммитим именно схему; полный гейт сборки — на тех задачах, где файл уже консистентен.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/schema.ts tests/lib/scenario/schema-blocks.test.ts
git commit -m "feat(schema): контент-план blocks в каркасе + поля качества в meta"
```

---

## Task 2: Катящийся контекст (`context.ts`)

**Files:**
- Create: `lib/scenario/context.ts`
- Test: `tests/lib/scenario/context.test.ts` (create)

- [ ] **Step 1: Написать падающий тест**

Создать `tests/lib/scenario/context.test.ts`:

```typescript
import { type GeneratedBlock, buildRunningContext } from '@/lib/scenario/context'
import { describe, expect, it } from 'vitest'

describe('buildRunningContext', () => {
  it('для пустого списка возвращает пустую строку', () => {
    expect(buildRunningContext([])).toBe('')
  })

  it('включает заголовок этапа, тип и срез текста', () => {
    const blocks: GeneratedBlock[] = [
      { stageTitle: 'Старт', type: 'discussion', text: 'Учитель: Здравствуйте, ребята.' },
    ]
    const ctx = buildRunningContext(blocks)
    expect(ctx).toContain('Старт')
    expect(ctx).toContain('discussion')
    expect(ctx).toContain('Здравствуйте')
  })

  it('обрезает длинный текст до ~200 символов и схлопывает пробелы', () => {
    const long = `${'а'.repeat(500)}`
    const ctx = buildRunningContext([{ stageTitle: 'M', type: 'task', text: long }])
    // строка-сводка не должна тащить все 500 символов
    expect(ctx.length).toBeLessThan(350)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm exec vitest run tests/lib/scenario/context.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `context.ts`**

Создать `lib/scenario/context.ts`:

```typescript
// Катящаяся сводка уже сгенерированных блоков — прокидывается в следующий per-block
// вызов, чтобы модель не повторялась и связывала ход занятия. Строится программно,
// без обращения к LLM.

export type GeneratedBlock = {
  stageTitle: string
  type: string
  text: string
}

const SNIPPET_CHARS = 200

export function buildRunningContext(blocks: GeneratedBlock[]): string {
  if (blocks.length === 0) return ''
  const lines = blocks.map((b) => {
    const snippet = b.text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS)
    return `— Этап «${b.stageTitle}» (${b.type}): ${snippet}…`
  })
  return [
    'Уже раскрыто в предыдущих блоках (НЕ повторяй их содержание — опирайся и развивай дальше):',
    ...lines,
  ].join('\n')
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm exec vitest run tests/lib/scenario/context.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/context.ts tests/lib/scenario/context.test.ts
git commit -m "feat(scenario): катящийся контекст готовых блоков (buildRunningContext)"
```

---

## Task 3: Детерминированный гейт качества (`quality.ts`)

**Files:**
- Create: `lib/scenario/quality.ts`
- Test: `tests/lib/scenario/quality.test.ts` (create)

- [ ] **Step 1: Написать падающий тест**

Создать `tests/lib/scenario/quality.test.ts`:

```typescript
import { type ScenarioContent } from '@/lib/scenario/schema'
import { checkBlock, checkScenario } from '@/lib/scenario/quality'
import { describe, expect, it } from 'vitest'

const longText = (teacherTurns: number) =>
  Array.from({ length: teacherTurns }, (_, i) => `Учитель: ${'фраза по теме. '.repeat(20)} (${i})`).join('\n')

describe('checkBlock', () => {
  it('плотный блок основной части проходит', () => {
    const r = checkBlock(
      { type: 'discussion', text: longText(3), questions: ['а?', 'б?', 'в?'] },
      'main',
    )
    expect(r.ok).toBe(true)
  })

  it('короткий текст не проходит', () => {
    const r = checkBlock({ type: 'task', text: 'мало' }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('коротк')
  })

  it('основная часть с одной репликой Учителя не проходит', () => {
    const r = checkBlock({ type: 'task', text: longText(1) }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('Учитель')
  })

  it('обсуждение с <3 вопросами не проходит', () => {
    const r = checkBlock({ type: 'discussion', text: longText(3), questions: ['а?'] }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('вопрос')
  })

  it('рефлексия не требует 2 реплик Учителя', () => {
    const r = checkBlock({ type: 'task', text: longText(1) }, 'reflection')
    expect(r.ok).toBe(true)
  })
})

describe('checkScenario', () => {
  const big = (n: number) => 'я'.repeat(n)
  const base: ScenarioContent = {
    title: 'T',
    goals: ['g'],
    coreMeanings: ['дружба помогает преодолевать трудности'],
    materials: [],
    stages: [
      { kind: 'engage', title: 'Старт', duration_min: 5, activities: [{ type: 'discussion', text: big(5000) }] },
      { kind: 'main', title: 'Основа', duration_min: 10, activities: [{ type: 'task', text: `дружба ${big(5000)}` }] },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }

  it('большой связный сценарий — без предупреждений', () => {
    expect(checkScenario(base).warnings).toHaveLength(0)
  })

  it('малый объём → предупреждение', () => {
    const small = { ...base, stages: [{ ...base.stages[0], activities: [{ type: 'discussion' as const, text: 'коротко' }] }] }
    expect(checkScenario(small).warnings.join(' ')).toContain('объём')
  })

  it('дубль заголовков этапов → предупреждение', () => {
    const dup = { ...base, stages: [base.stages[0], { ...base.stages[1], title: 'Старт' }] }
    expect(checkScenario(dup).warnings.join(' ')).toContain('заголовк')
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm exec vitest run tests/lib/scenario/quality.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `quality.ts`**

Создать `lib/scenario/quality.ts`:

```typescript
import type { ScenarioContent } from './schema'

// Детерминированный гейт качества блоков и сценария. Без LLM-вызовов:
// объективные пороги, которые перегенерируют тонкие блоки и помечают слабый сценарий.

const MIN_BLOCK_CHARS = Number(process.env.MIN_BLOCK_CHARS ?? 600)
const MIN_SCENARIO_CHARS = Number(process.env.MIN_SCENARIO_CHARS ?? 9000)

export type BlockForCheck = {
  type: string
  text: string
  questions?: string[]
}

export function checkBlock(
  block: BlockForCheck,
  stageKind: string,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const text = block.text.trim()
  if (text.length < MIN_BLOCK_CHARS) reasons.push('слишком короткий текст блока')

  const teacherTurns = (text.match(/Учитель\s*:/g) ?? []).length
  if ((stageKind === 'engage' || stageKind === 'main') && teacherTurns < 2) {
    reasons.push('мало реплик «Учитель:» (нужно ≥2)')
  }

  if (block.type === 'discussion' && (block.questions?.length ?? 0) < 3) {
    reasons.push('мало вопросов для обсуждения (нужно ≥3)')
  }

  return { ok: reasons.length === 0, reasons }
}

const significantWords = (s: string): string[] => s.toLowerCase().match(/[а-яёa-z]{5,}/g) ?? []

export function checkScenario(content: ScenarioContent): { warnings: string[] } {
  const warnings: string[] = []

  const total = JSON.stringify(content).length
  if (total < MIN_SCENARIO_CHARS) {
    warnings.push(`общий объём ниже ожидаемого (${total} симв.)`)
  }

  const titles = content.stages.map((s) => s.title.trim().toLowerCase())
  if (new Set(titles).size < titles.length) {
    warnings.push('дублирующиеся заголовки этапов')
  }

  const body = content.stages
    .flatMap((s) => s.activities.map((a) => a.text))
    .join(' ')
    .toLowerCase()
  for (const m of content.coreMeanings ?? []) {
    const words = significantWords(m)
    if (words.length > 0 && !words.some((w) => body.includes(w))) {
      warnings.push(`смысл не раскрыт в ходе занятия: «${m.slice(0, 40)}…»`)
    }
  }

  return { warnings }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm exec vitest run tests/lib/scenario/quality.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/quality.ts tests/lib/scenario/quality.test.ts
git commit -m "feat(scenario): детерминированный гейт качества блоков и сценария"
```

---

## Task 4: Промпты — контент-план в каркасе + per-block билдер

**Files:**
- Modify: `lib/scenario/prompt.ts`
- Test: `tests/lib/scenario/prompt.test.ts` (modify), `tests/lib/scenario/prompt-stream.test.ts` (modify)

- [ ] **Step 1: Написать/обновить падающие тесты**

В `tests/lib/scenario/prompt.test.ts`:
- Удалить импорт `buildStageDetailsMessages` (строка 5) и весь `describe('buildStageDetailsMessages', …)` (строки ~90-конец блока).
- Добавить импорт `buildBlockMessages` и новый блок:

```typescript
import { buildBlockMessages, buildSkeletonMessages } from '@/lib/scenario/prompt'

const skeletonInput = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа' as const,
}

const skeleton = {
  title: 'Дружба',
  goals: ['ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  stages: [{ kind: 'main' as const, title: 'Основа', duration_min: 15 }],
}

describe('buildSkeletonMessages content-plan', () => {
  it('требует контент-план blocks в схеме каркаса', () => {
    const sys = buildSkeletonMessages(skeletonInput)[0].content
    expect(sys).toContain('blocks')
  })
})

describe('buildBlockMessages', () => {
  it('содержит бриф, тему и просит ОДИН блок', () => {
    const msgs = buildBlockMessages(
      skeletonInput,
      skeleton,
      skeleton.stages[0],
      { type: 'discussion', focus: 'что значит быть настоящим другом' },
      [],
      '',
    )
    const user = msgs[1].content
    expect(user).toContain('что значит быть настоящим другом')
    expect(user).toContain('Дружба')
    const sys = msgs[0].content
    expect(sys.toLowerCase()).toContain('один')
  })

  it('встраивает катящийся контекст, когда он передан', () => {
    const msgs = buildBlockMessages(
      skeletonInput,
      skeleton,
      skeleton.stages[0],
      { type: 'task', focus: 'игра' },
      [],
      'Уже раскрыто: вступление про дружбу',
    )
    expect(msgs[1].content).toContain('Уже раскрыто: вступление про дружбу')
  })
})
```

В `tests/lib/scenario/prompt-stream.test.ts`:
- Удалить импорт `buildDetailsMessages` и весь `describe('buildDetailsMessages', …)`. Оставить тесты `buildSkeletonMessages`, если есть. Если файл станет пустым — удалить файл целиком (`git rm`).

- [ ] **Step 2: Запустить тесты — должны упасть**

Run: `pnpm exec vitest run tests/lib/scenario/prompt.test.ts`
Expected: FAIL (`buildBlockMessages` не существует; `blocks` нет в skeleton-промпте).

- [ ] **Step 3: Реализовать изменения промптов**

В `lib/scenario/prompt.ts`:

(a) Bump версии (строка 4):

```typescript
export const PROMPT_VERSION = 'v6-rov-blocks-2026-05-23'
```

(b) Заменить `SKELETON_SCHEMA_HINT` (строки ~109-120) — добавить `blocks` в этап:

```typescript
const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (БЕЗ полного текста активностей — их распишут отдельно):
{
  "title": string,
  "goals": string[],            // 2-4 воспитательных результата
  "values": string[],           // формируемые ценности (1-3): напр. «дружба», «созидательный труд»
  "coreMeanings": string[],     // основные смыслы (3-4): ценностные тезисы по теме, КАЖДЫЙ развёрнутой фразой
  "materials": string[],        // что нужно для занятия
  "adaptations": { "simpler": string, "harder": string },
  "stages": [                   // минимум 3 этапа: вовлечение (engage), основная часть (main), рефлексия (reflection)
    {
      "kind": "engage" | "main" | "reflection",
      "title": string,
      "duration_min": number,
      // blocks — КОНТЕНТ-ПЛАН этапа: на КАЖДЫЙ блок отдельная карточка {type, focus}.
      // focus — конкретно, ЧТО раскрывает блок и какой смысл несёт (а не общие слова).
      // Распредели основные смыслы по блокам, без повторов между блоками.
      // main: 2-4 блока; engage и reflection: 1-2 блока.
      "blocks": [ { "type": "discussion" | "quiz" | "game" | "task" | "video", "focus": string } ]
    }
  ]
}`
```

(c) В `buildSkeletonMessages` system-тексте (строки ~127-138) добавить строку про контент-план перед `SKELETON_SCHEMA_HINT`:

```typescript
    'Для КАЖДОГО этапа составь контент-план blocks: список блоков {type, focus}, где focus —',
    'конкретное содержание блока. Основная часть — 2-4 блока, старт и рефлексия — 1-2.',
```

(d) Удалить функции `buildDetailsMessages` (строки ~174-222) и `buildStageDetailsMessages` (строки ~238-297) вместе с относящимся к ним `STAGE_SCHEMA_HINT` (если используется только ими). Добавить новый билдер и схему-хинт одного блока:

```typescript
const BLOCK_SCHEMA_HINT = `Верни JSON ТОЛЬКО для ОДНОГО блока (одна активность):
{
  // type — СТРОГО одно из пяти: discussion, quiz, game, task, video. НЕ придумывай других.
  // презентация/слайды → video; работа в группах/практическое → task; беседа → discussion.
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  // text: ПЛОТНЫЙ готовый ход ОДНОГО блока уровня «Разговоров о важном» — несколько реплик
  // «Учитель: …» подряд (каждая 3-6 развёрнутых предложений) с КОНКРЕТНЫМ содержанием
  // (факты, примеры, истории, цитаты, ценностные смыслы) + пометки «Ответы обучающихся.».
  "text": string,
  // questions: для обсуждений — 3-5 РАЗВЁРНУТЫХ разноуровневых вопросов
  // (вовлечение → анализ сути → личное отношение и ценностный вывод).
  "questions"?: string[]
}`

// Промпт для генерации деталей ОДНОГО блока (per-block — даёт РоВ-глубину: каждый вызов
// насыщается на один блок, объём масштабируется числом блоков).
export function buildBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
): ChatMessage[] {
  const stageRole =
    stage.kind === 'engage'
      ? 'мотивационно-целевой этап (эмоциональный старт, включение в тему)'
      : stage.kind === 'reflection'
        ? 'заключительный этап (рефлексия, личный вывод каждого)'
        : 'основная смысловая часть (раскрытие сути темы, интерактив)'

  const system = [
    'Ты — опытный методист внеурочной деятельности в школе РФ, эталон — «Разговоры о важном».',
    'Тебе дан каркас занятия и ОДИН его блок (одна активность). Распиши ПОДРОБНО ТОЛЬКО этот блок.',
    `Этап блока — ${stageRole}.`,
    'ГЛУБИНА: в поле text давай ПЛОТНЫЙ готовый ход — несколько реплik «Учитель: …» подряд',
    '(каждая 3-6 развёрнутых предложений) с конкретным содержанием по теме (факты, примеры,',
    'истории, цитаты, ценностные смыслы) + пометки «Ответы обучающихся.» там, где отвечают дети.',
    'НЕ ПИШИ обобщения «учитель рассказывает / объясняет / показывает видео» — ДАВАЙ дословную речь.',
    'Текста должно хватать, чтобы провести этот блок, читая дословно.',
    'ВОПРОСЫ — развёрнутые, разноуровневые, по 3-5 на обсуждение.',
    'Раскрывай ИМЕННО фокус этого блока, не дублируй то, что уже было в предыдущих блоках.',
    'Отвечаешь строго JSON одного блока, без markdown. Без реальных имён детей.',
    '',
    BLOCK_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект одного блока { "type": …, "text": …, "questions"?: … }.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся на факты и стиль, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const meanings =
    skeleton.coreMeanings && skeleton.coreMeanings.length > 0
      ? ['', 'Основные смыслы занятия (держи в уме, раскрывай уместные в этом блоке):', ...skeleton.coreMeanings.map((m) => `• ${m}`)]
      : []

  const user = [
    `Занятие: «${skeleton.title}». Тема «${input.topic}», направление ${input.direction}, ${formatGradeForPrompt(input.grade)}, формат ${input.format}.`,
    `Этап: «${stage.title}» (${stage.kind}, ${stage.duration_min} мин).`,
    `Блок (${brief.type}): ${brief.focus}`,
    ...meanings,
    ...methodology,
    ...(runningContext ? ['', runningContext] : []),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
```

Примечание: если `STAGE_SCHEMA_HINT` использовался только удаляемыми функциями — удалить его. Если на него ссылается что-то ещё — оставить (проверить `grep -n STAGE_SCHEMA_HINT lib/scenario/prompt.ts`).

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm exec vitest run tests/lib/scenario/prompt.test.ts tests/lib/scenario/prompt-stream.test.ts`
Expected: PASS.

Примечание: `tsc --noEmit` ещё покажет ошибку в `stream.ts` (импорт удалённого `buildStageDetailsMessages`) — чинится в Task 5.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/prompt.ts tests/lib/scenario/prompt.test.ts tests/lib/scenario/prompt-stream.test.ts
git commit -m "feat(prompt): контент-план в каркасе + per-block билдер (v6), удалены per-stage билдеры"
```

---

## Task 5: Per-block оркестрация в `stream.ts`

**Files:**
- Modify: `lib/scenario/stream.ts`
- Test: `tests/lib/scenario/stream.test.ts` (modify)

- [ ] **Step 1: Обновить тест под per-block**

Заменить `tests/lib/scenario/stream.test.ts` целиком на:

```typescript
import type { ScenarioContent } from '@/lib/scenario/schema'
import { streamScenario } from '@/lib/scenario/stream'
import { describe, expect, it, vi } from 'vitest'

const input = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 20,
  format: 'беседа' as const,
}

// Каркас с контент-планом: 3 этапа, по 1 блоку → всего 3 блока.
const SKELETON = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  materials: ['Доска'],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
  stages: [
    { kind: 'engage', title: 'Старт', duration_min: 5, blocks: [{ type: 'discussion', focus: 'старт' }] },
    { kind: 'main', title: 'Основа', duration_min: 10, blocks: [{ type: 'game', focus: 'игра' }] },
    { kind: 'reflection', title: 'Итог', duration_min: 5, blocks: [{ type: 'task', focus: 'итог' }] },
  ],
}

// Плотный блок, проходящий гейт (≥600 симв., ≥2 реплики «Учитель:»).
const denseText = `${'Учитель: содержательная реплика по теме дружбы с примерами и фактами. '.repeat(12)}`
const BLOCK = JSON.stringify({ type: 'discussion', text: denseText, questions: ['а?', 'б?', 'в?'] })

function chunked(s: string, n = 20): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out
}

function makeChatStream() {
  return async function* () {
    for (const piece of chunked(JSON.stringify(SKELETON))) yield piece
  }
}

describe('streamScenario (per-block)', () => {
  it('эмитит phase, skeleton, block×N, saving и done', async () => {
    const save = vi.fn(async (_c: ScenarioContent, _m: unknown) => 'scenario-123')
    const chat = vi.fn(async () => ({ content: BLOCK, usage: null }))
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream() as any,
      chat: chat as any,
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }

    const types = events.map((e) => e.type)
    expect(types).toContain('skeleton')
    expect(types.filter((t) => t === 'block')).toHaveLength(3)
    const blockEv = events.find((e) => e.type === 'block')
    expect(blockEv).toMatchObject({ type: 'block', total: 3 })
    expect(events.find((e) => e.type === 'done')).toEqual({ type: 'done', scenarioId: 'scenario-123' })

    expect(save).toHaveBeenCalledTimes(1)
    const [savedContent] = save.mock.calls[0]
    expect(savedContent.stages).toHaveLength(3)
    expect(savedContent.stages.every((s: any) => s.activities.length >= 1)).toBe(true)
  })

  it('перегенерирует тонкий блок (гейт), затем принимает плотный', async () => {
    const thin = JSON.stringify({ type: 'task', text: 'коротко' })
    const calls: string[] = []
    // первый блок: сначала тонкий, потом плотный; остальные блоки — сразу плотные
    let firstBlockTries = 0
    const chat = vi.fn(async () => {
      // эвристика для теста: первый вызываемый блок отдаёт тонкий один раз
      if (firstBlockTries === 0) {
        firstBlockTries++
        calls.push('thin')
        return { content: thin, usage: null }
      }
      calls.push('dense')
      return { content: BLOCK, usage: null }
    })
    const save = vi.fn(async () => 'x')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream() as any,
      chat: chat as any,
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }
    // был хотя бы один «тонкий» ответ → значит произошёл повторный вызов
    expect(calls[0]).toBe('thin')
    expect(chat.mock.calls.length).toBeGreaterThan(3) // 3 блока + ≥1 ретрай
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('эмитит error при невалидном каркасе', async () => {
    const badStream = async function* () {
      for (const p of chunked('не json вовсе')) yield p
    }
    const save = vi.fn(async () => 'x')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: (() => badStream()) as any,
      chat: async () => ({ content: 'всё ещё не json', usage: null }),
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm exec vitest run tests/lib/scenario/stream.test.ts`
Expected: FAIL (нет события `block`; стрим ещё per-stage и не компилируется из-за удалённых импортов).

- [ ] **Step 3: Переписать `stream.ts`**

Заменить импорты (строки 6-26) — убрать `buildStageDetailsMessages`, `stageActivitiesSchema`; добавить `buildBlockMessages`, `buildRunningContext`/`GeneratedBlock`, `checkBlock`/`checkScenario`, `activitySchema`:

```typescript
import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { coerceActivityType } from './coerce'
import { type GeneratedBlock, buildRunningContext } from './context'
import { generateValidated } from './llm-retry'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import {
  PROMPT_VERSION,
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildBlockMessages,
  buildSkeletonMessages,
} from './prompt'
import { checkBlock, checkScenario } from './quality'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  activitySchema,
  scenarioContentSchema,
  skeletonSchema,
} from './schema'
import { chunksForStage } from './stage-chunks'

const MAX_BLOCK_RETRIES = Number(process.env.MAX_BLOCK_RETRIES ?? 2)
```

Заменить тип `StreamEvent` (строки 28-33): убрать `stage`, добавить `block`:

```typescript
export type StreamEvent =
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }
```

Заменить `parseStageActivities` (строки 71-84) на `parseBlock` (одна активность):

```typescript
function parseBlock(raw: string): Activity | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  ;(obj as { type?: unknown }).type = coerceActivityType((obj as { type?: unknown }).type)
  const parsed = activitySchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}
```

Заменить блок «STAGE 2» (строки ~160-204, от `// STAGE 2:` до строки с `const content = parsedFull.data`) на per-block цикл:

```typescript
    // STAGE 2: детали ПО БЛОКАМ — отдельный фокусный вызов на каждый блок (РоВ-глубина).
    // Объём масштабируется числом блоков; катящийся контекст держит связность;
    // локальный гейт перегенерирует тонкие блоки.
    yield { type: 'phase', phase: 'details' }

    type Pending = { stageIndex: number; brief: { type: string; focus: string } }
    const queue: Pending[] = []
    skeleton.stages.forEach((st, stageIndex) => {
      const briefs =
        st.blocks && st.blocks.length > 0
          ? st.blocks
          : [{ type: 'discussion', focus: st.title }]
      for (const b of briefs) queue.push({ stageIndex, brief: b })
    })
    const total = queue.length

    let repaired = false
    let thinBlocks = 0
    const doneBlocks: GeneratedBlock[] = []
    const stageActivities: Activity[][] = skeleton.stages.map(() => [])

    for (let i = 0; i < queue.length; i++) {
      const { stageIndex, brief } = queue[i]
      const st = skeleton.stages[stageIndex]
      let msgs = buildBlockMessages(
        input,
        skeleton,
        st,
        brief,
        chunksForStage(ragChunks, st.kind),
        buildRunningContext(doneBlocks),
      )

      let best: Activity | null = null
      let accepted = false
      for (let r = 0; r <= MAX_BLOCK_RETRIES; r++) {
        const res = await generateValidated(chat, msgs, parseBlock, {
          attempts: 3,
          temperature: 0.5,
          corrective:
            'Ответ невалиден. Верни ТОЛЬКО валидный JSON одного блока { "type", "text", "questions"? }, без markdown.',
        })
        if (!res) break
        if (res.attempts > 1) repaired = true
        best = res.value
        const gate = checkBlock(res.value, st.kind)
        if (gate.ok) {
          accepted = true
          break
        }
        // тонкий, но валидный блок — заостряем диалог и повторяем
        msgs = [
          ...msgs,
          {
            role: 'assistant',
            content: JSON.stringify({
              type: res.value.type,
              text: res.value.text,
              questions: res.value.questions,
            }),
          },
          {
            role: 'user',
            content: `Блок получился тонким (${gate.reasons.join(', ')}). Сделай его существенно плотнее: добавь ещё несколько реплик «Учитель: …» с конкретикой (факты, примеры, истории) и больше развёрнутых вопросов. Верни ТОЛЬКО валидный JSON одного блока.`,
          },
        ]
      }

      if (!best) throw new Error(`Не удалось сгенерировать блок «${brief.focus}»`)
      if (!accepted) thinBlocks++
      stageActivities[stageIndex].push(best)
      doneBlocks.push({ stageTitle: st.title, type: best.type, text: best.text })
      yield { type: 'block', index: i, total }
    }

    yield { type: 'phase', phase: 'validating' }
    const assembled = {
      title: skeleton.title,
      goals: skeleton.goals,
      values: skeleton.values,
      coreMeanings: skeleton.coreMeanings,
      materials: skeleton.materials ?? [],
      adaptations: skeleton.adaptations ?? {
        simpler: 'Для младших классов упростить формулировки и сократить объём.',
        harder: 'Для старших классов углубить обсуждение и добавить задания.',
      },
      stages: skeleton.stages.map((st, idx) => ({
        kind: st.kind,
        title: st.title,
        duration_min: st.duration_min,
        activities: stageActivities[idx],
      })),
    }
    const parsedFull = scenarioContentSchema.safeParse(assembled)
    if (!parsedFull.success) throw new Error('Собранный сценарий не прошёл валидацию')
    const content = parsedFull.data
```

Обновить блок `meta` (строки ~206-216) — добавить качество:

```typescript
    const { content: normalized, changed } = normalizeChronometry(content, input.durationMin)
    const { warnings } = checkScenario(normalized)

    const meta: GenerationMeta = {
      model,
      promptVersion: PROMPT_VERSION,
      repaired,
      normalized: changed,
      usage: null,
      latencyMs: Date.now() - started,
      usedChunkIds,
      thinBlocks,
      qualityWarnings: warnings,
    }
```

(Остальное — `saving`/`done`/`catch` — без изменений.)

- [ ] **Step 4: Запустить тест и полный гейт типов**

Run: `pnpm exec vitest run tests/lib/scenario/stream.test.ts && pnpm tsc --noEmit`
Expected: PASS (3 теста), tsc без ошибок.

- [ ] **Step 5: Полный прогон и Commit**

```bash
pnpm test && pnpm lint && pnpm build
git add lib/scenario/stream.ts tests/lib/scenario/stream.test.ts
git commit -m "feat(stream): per-block оркестрация с катящимся контекстом и гейтом качества"
```

Expected: все гейты зелёные; роут `/api/generate/stream` в выводе build.

---

## Task 6: Прогресс per-block в UI

**Files:**
- Modify: `components/generation/GenerationStream.tsx`

- [ ] **Step 1: Обновить тип события и состояние**

В `components/generation/GenerationStream.tsx` заменить тип `StreamEvent` (строки 11-16):

```typescript
type StreamEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'skeleton'; data: { title?: string; stages?: Array<{ title?: string }> } }
  | { type: 'block'; index: number; total: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }
```

Заменить состояние `filled` (строка 31) на счётчики блоков:

```typescript
  const [blocksDone, setBlocksDone] = useState(0)
  const [blocksTotal, setBlocksTotal] = useState(0)
```

- [ ] **Step 2: Обновить обработку события**

Заменить ветку `else if (ev.type === 'stage') …` (строка 79) на:

```typescript
            } else if (ev.type === 'block') {
              setBlocksTotal(ev.total)
              setBlocksDone((n) => Math.max(n, ev.index + 1))
            } else if (ev.type === 'done') router.push(`/app/scenarios/${ev.scenarioId}`)
```

(Убедиться, что прежняя ветка `else if (ev.type === 'done') …` не осталась продублированной — она теперь внутри блока выше; ветку `error` оставить следующей.)

- [ ] **Step 3: Обновить рендер прогресса**

Заменить нижний `<div className="space-y-2">…</div>` (строки 126-138, список этапов по `filled`) на прогресс-бар по блокам + outline этапов:

```tsx
        {blocksTotal > 0 && (
          <div className="space-y-1">
            <p className="text-sm text-neutral-600">
              Прорабатываем блоки: {blocksDone} из {blocksTotal}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.round((blocksDone / blocksTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(stageTitles.length > 0 ? stageTitles : ['', '', '']).map((st, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stages ordered by index; no stable id during stream
            <div key={`stage-${i}`} className="rounded-md bg-neutral-50 p-3 ring-1 ring-neutral-200">
              <p className="text-sm font-medium text-neutral-800">{st || ' '}</p>
            </div>
          ))}
        </div>
```

- [ ] **Step 4: Гейты**

Run: `pnpm lint && pnpm tsc --noEmit && pnpm build`
Expected: без ошибок (нет ссылок на удалённый `filled`).

- [ ] **Step 5: Commit**

```bash
git add components/generation/GenerationStream.tsx
git commit -m "feat(ui): прогресс генерации по блокам вместо по этапам"
```

---

## Task 7: Финальная сверка, статус-доки, ручные шаги

**Files:**
- Modify: `CLAUDE.md` (блок «Пост-milestone изменения»)
- Modify: `docs/backlog.md` (#21)

- [ ] **Step 1: Полный гейт всего проекта**

Run: `pnpm test && pnpm lint && pnpm tsc --noEmit && pnpm build`
Expected: всё зелёное; число тестов выросло относительно базы (новые context/quality/schema-blocks/prompt/stream).

- [ ] **Step 2: Греп на осиротевшие ссылки**

Run: `grep -rn "buildStageDetailsMessages\|buildDetailsMessages\|stageActivitiesSchema\|type: 'stage'" lib app components tests`
Expected: пусто (все удалены/заменены). Если что-то осталось — починить и перезапустить Step 1.

- [ ] **Step 3: Обновить статус в `CLAUDE.md`**

В раздел «Пост-milestone изменения (на master, вне нумерованных планов)» добавить пункт о per-block пайплайне: суть (1 вызов на блок, контент-план в каркасе, катящийся контекст, per-block гейт), `PROMPT_VERSION=v6-rov-blocks-2026-05-23`, без миграций, ручной шаг — пере-сид библиотеки и живой UAT.

- [ ] **Step 4: Обновить `docs/backlog.md`**

Перевести #21 в «Сделано» (код-часть) с пометкой про ручные шаги: живой UAT объёма (~15-18 КБ) и `pnpm seed:shared --force` на проде.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: per-block РоВ-пайплайн — статус и backlog #21"
```

---

## Ручные шаги (вне кода, требуют живого окружения)

- **Живой UAT:** прогнать генерацию против GigaChat на 2-3 темах/форматах; замерить объём (цель ~15-18 КБ), визуально проверить многоходовость «Учитель: …», связность между блоками (нет повторов), 3-5 вопросов в обсуждениях. Засечь латентность (ожидаемо ~1.5-2 мин).
- **Пере-сид библиотеки:** после деплоя на проде `pnpm exec tsx scripts/seed-shared.ts --force` (наследует новый пайплайн автоматически).
- **Тюнинг порогов (опц.):** если блоки систематически тонкие/слишком длинные — подстроить env `MIN_BLOCK_CHARS`, `MAX_BLOCK_RETRIES` без правок кода.

## Риски (из спеки)
- Латентность ~2 мин — принято; прогресс-бар per-block держит UX.
- Rate-limit считает 1 событие на пользовательскую генерацию — оставляем.
- Фактологичность опирается на RAG-чанки; гейт проверяет только плотность, не достоверность — осознанно вне scope.
- Без миграций (контент в jsonb; `blocks` каркаса — промежуточный план, в БД не сохраняется отдельным полем).
