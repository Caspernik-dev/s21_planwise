# Регенерация активности на per-block пайплайне — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Точечная 🎲-регенерация активности должна давать блок РоВ-глубины (как полная генерация), уважать роль этапа и НЕ менять тип произвольно — тип выбирает учитель (дефолт = текущий), итоговый тип форсится по выбору. Закрывает backlog #22 (старый промпт) и #31 (введение/рефлексия → игра).

**Architecture:** Вынести общий шаг «сгенерировать один блок с гейтом качества» из `stream.ts` в `lib/scenario/block-gen.ts`. Переписать `regenerate.ts` на `buildBlockMessages` (роль этапа + смыслы + катящийся контекст соседних активностей) + этот хелпер, с форсом выбранного типа. Прокинуть выбор типа через server action и UI редактора.

**Tech Stack:** Next.js 15, TypeScript, Vitest, GigaChat, zod.

**Спека:** `docs/superpowers/specs/2026-05-23-regenerate-per-block-design.md`
**Базис:** ветка от `master`. Конвенции CLAUDE.md: один коммит на задачу; TDD; гейты зелёные (`pnpm test`, `pnpm lint`, `tsc --noEmit`, `pnpm build`); UI на русском; юнит-тесты без сети/БД.

---

## Карта файлов

- `lib/scenario/block-gen.ts` — **create**: `parseBlock` + `generateBlockWithGate` (общий шаг генерации одного блока с гейтом). Чистый, DI `chat`.
- `lib/scenario/stream.ts` — **modify**: использовать `block-gen` вместо инлайн-цикла; убрать осиротевшее (`parseBlock`, `MAX_BLOCK_RETRIES`, импорты `checkBlock`/`activitySchema`).
- `lib/scenario/regenerate.ts` — **rewrite**: на `buildBlockMessages` + `generateBlockWithGate` + форс типа; удалить `buildActivityMessages`/`ACTIVITY_SCHEMA_HINT`/`extractJson`/`tryParse`.
- `app/app/scenarios/[id]/actions.ts` — **modify**: `regenerateActivityAction` принимает `type`, реконструирует skeleton + runningContext, зовёт новый `regenerateActivity`.
- `app/app/scenarios/[id]/editor.tsx` — **modify**: селектор типа у 🎲.
- Тесты: `tests/lib/scenario/block-gen.test.ts` (create), `tests/lib/scenario/regenerate.test.ts` (rewrite), `tests/lib/scenario/stream.test.ts` (остаётся зелёным).

**НЕ трогаем:** контракт `ScenarioContent`, БД (без миграций), поведение Save, rate-limit `MAX_REGEN_PER_DAY`.

---

## Task 1: Общий хелпер `block-gen.ts` + рефактор `stream.ts`

**Files:**
- Create: `lib/scenario/block-gen.ts`
- Create: `tests/lib/scenario/block-gen.test.ts`
- Modify: `lib/scenario/stream.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/lib/scenario/block-gen.test.ts`:

```typescript
import { generateBlockWithGate, parseBlock } from '@/lib/scenario/block-gen'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { describe, expect, it, vi } from 'vitest'

const dense = `${'Учитель: содержательная реплика по теме с примером и фактом. '.repeat(12)}`
const DENSE_BLOCK = JSON.stringify({ type: 'discussion', text: dense, questions: ['а?', 'б?', 'в?'] })
const THIN_BLOCK = JSON.stringify({ type: 'task', text: 'коротко' })

const chatOf = (...contents: string[]) => {
  let i = 0
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => {
    const c = contents[Math.min(i, contents.length - 1)]
    i++
    return { content: c, usage: null }
  })
}

describe('parseBlock', () => {
  it('парсит и коэрсит тип', () => {
    const a = parseBlock(JSON.stringify({ type: 'debate', text: 'x' }))
    expect(a?.type).toBe('discussion')
  })
  it('null на мусоре', () => {
    expect(parseBlock('не json')).toBeNull()
  })
})

describe('generateBlockWithGate', () => {
  it('принимает плотный блок с первого раза', async () => {
    const chat = chatOf(DENSE_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main')
    expect(r?.accepted).toBe(true)
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('перегенерирует тонкий блок, затем принимает плотный', async () => {
    const chat = chatOf(THIN_BLOCK, DENSE_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 2 })
    expect(r?.accepted).toBe(true)
    expect(chat.mock.calls.length).toBeGreaterThan(1)
  })

  it('исчерпав ретраи, возвращает лучший с accepted=false', async () => {
    const chat = chatOf(THIN_BLOCK)
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 1 })
    expect(r?.accepted).toBe(false)
    expect(r?.value.text).toBe('коротко')
  })

  it('null если все ответы невалидны', async () => {
    const chat = chatOf('не json вовсе')
    const r = await generateBlockWithGate(chat, [], 'main', { maxRetries: 1 })
    expect(r).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm exec vitest run tests/lib/scenario/block-gen.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Создать `lib/scenario/block-gen.ts`**

```typescript
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { coerceActivityType } from './coerce'
import { generateValidated } from './llm-retry'
import { parsePartialJson } from './partial'
import { checkBlock } from './quality'
import { type ScenarioContent, activitySchema } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>
export type Activity = ScenarioContent['stages'][number]['activities'][number]

const DEFAULT_MAX_RETRIES = (() => {
  const n = Number(process.env.MAX_BLOCK_RETRIES)
  return Number.isFinite(n) && n >= 0 ? n : 2
})()

// Парс ответа одного блока: дополнить оборванный JSON → коэрсить type → zod.
export function parseBlock(raw: string): Activity | null {
  const obj = parsePartialJson(raw)
  if (!obj || typeof obj !== 'object') return null
  ;(obj as { type?: unknown }).type = coerceActivityType((obj as { type?: unknown }).type)
  const parsed = activitySchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}

// Сгенерировать ОДИН блок с детерминированным гейтом качества: при «тонкости»
// заострить промпт и повторить до maxRetries. Возвращает лучший результат + флаги.
export async function generateBlockWithGate(
  chat: ChatFn,
  messages: GigaMessage[],
  stageKind: string,
  opts: { maxRetries?: number } = {},
): Promise<{ value: Activity; repaired: boolean; accepted: boolean } | null> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  let msgs = messages
  let best: Activity | null = null
  let repaired = false
  let accepted = false

  for (let r = 0; r <= maxRetries; r++) {
    const res = await generateValidated(chat, msgs, parseBlock, {
      attempts: 3,
      temperature: 0.5,
      corrective:
        'Ответ невалиден. Верни ТОЛЬКО валидный JSON одного блока { "type", "text", "questions"? }, без markdown.',
    })
    if (!res) break
    if (res.attempts > 1) repaired = true
    best = res.value
    const gate = checkBlock(res.value, stageKind)
    if (gate.ok) {
      accepted = true
      break
    }
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

  if (!best) return null
  return { value: best, repaired, accepted }
}
```

- [ ] **Step 4: Запустить тест — пройдёт**

Run: `pnpm exec vitest run tests/lib/scenario/block-gen.test.ts`
Expected: PASS (6 проверок).

- [ ] **Step 5: Рефактор `stream.ts` на хелпер (поведение НЕ меняется)**

В `lib/scenario/stream.ts`:

(a) Импорты — добавить block-gen, убрать осиротевшие. Заменить строку импорта `coerce` и блок импорта `schema`:
- Добавить: `import { type Activity, generateBlockWithGate } from './block-gen'`
- В импорте из `./schema` УБРАТЬ `activitySchema` (больше не нужен в stream).
- УБРАТЬ импорт `checkBlock` из `./quality` (оставить `checkScenario`): строка станет `import { checkScenario } from './quality'`.
- Оставить `import { coerceActivityType } from './coerce'` (используется в `parseSkeleton`).
- Удалить локальный `type Activity = ...` (теперь импортируется из block-gen).
- Удалить локальную функцию `parseBlock` (переехала в block-gen).
- Удалить строку `const MAX_BLOCK_RETRIES = ...` (логика в хелпере).

(b) Заменить инлайн per-block цикл (блок `let best ... }` внутри `for (let i ...)`, от `let best: Activity | null = null` до закрывающей скобки перед `if (!best) throw`) на вызов хелпера. Итоговый цикл:

```typescript
    for (let i = 0; i < queue.length; i++) {
      const { stageIndex, brief } = queue[i]
      const st = skeleton.stages[stageIndex]
      const msgs: GigaMessage[] = buildBlockMessages(
        input,
        skeleton,
        st,
        brief,
        chunksForStage(ragChunks, st.kind),
        buildRunningContext(doneBlocks),
      )

      const r = await generateBlockWithGate(chat, msgs, st.kind)
      if (!r) throw new Error(`Не удалось сгенерировать блок «${brief.focus}»`)
      if (r.repaired) repaired = true
      if (!r.accepted) thinBlocks++
      const best = r.value

      stageActivities[stageIndex].push(best)
      doneBlocks.push({ stageTitle: st.title, type: best.type, text: best.text })
      yield { type: 'block', index: i, total }
    }
```

(Убедиться, что `repaired` и `thinBlocks` объявлены выше — они уже есть. `GigaMessage` уже импортирован в stream.ts.)

- [ ] **Step 6: Прогон гейтов — генерация не сломана**

Run: `pnpm exec vitest run tests/lib/scenario/stream.test.ts tests/lib/scenario/block-gen.test.ts && pnpm exec tsc --noEmit`
Expected: stream 3 теста PASS (поведение прежнее), block-gen PASS, tsc чисто.

- [ ] **Step 7: Commit**

```bash
pnpm lint
git add lib/scenario/block-gen.ts lib/scenario/stream.ts tests/lib/scenario/block-gen.test.ts
git commit -m "refactor(scenario): общий generateBlockWithGate, stream.ts на него"
```

---

## Task 2: Переписать `regenerate.ts` на per-block

**Files:**
- Modify (rewrite): `lib/scenario/regenerate.ts`
- Modify (rewrite): `tests/lib/scenario/regenerate.test.ts`

- [ ] **Step 1: Переписать тест под новый контракт**

Заменить `tests/lib/scenario/regenerate.test.ts` целиком на:

```typescript
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import type { ScenarioSkeleton } from '@/lib/scenario/schema'
import { describe, expect, it, vi } from 'vitest'

const input = {
  direction: 'Гражданское' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа' as const,
}

const skeleton: ScenarioSkeleton = {
  title: 'О дружбе',
  goals: ['ценность дружбы'],
  coreMeanings: ['дружба строится на доверии'],
  stages: [{ kind: 'engage', title: 'Вступление', duration_min: 5 }],
}

const dense = `${'Учитель: содержательная вводная реплика про дружбу с примером. '.repeat(12)}`

function chatReturning(content: string) {
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => ({ content, usage: null }))
}

describe('regenerateActivity', () => {
  it('использует роль этапа в промпте и возвращает блок', async () => {
    const chat = chatReturning(JSON.stringify({ type: 'discussion', text: dense, questions: ['а?', 'б?', 'в?'] }))
    const activity = await regenerateActivity(
      { input, skeleton, stage: { kind: 'engage', title: 'Вступление', duration_min: 5 }, targetType: 'discussion', runningContext: '' },
      { chat },
    )
    expect(activity.text).toContain('Учитель:')
    // в промпт ушла роль этапа (мотивационно-целевой)
    const sentSystem = (chat.mock.calls[0][0] as GigaMessage[])[0].content
    expect(sentSystem).toContain('мотивационно-целевой')
  })

  it('форсит выбранный тип, даже если модель вернула другой', async () => {
    // модель вернула game, учитель выбрал discussion → итог discussion
    const chat = chatReturning(JSON.stringify({ type: 'game', text: dense, questions: ['а?', 'б?', 'в?'] }))
    const activity = await regenerateActivity(
      { input, skeleton, stage: { kind: 'engage', title: 'Вступление', duration_min: 5 }, targetType: 'discussion', runningContext: '' },
      { chat },
    )
    expect(activity.type).toBe('discussion')
  })

  it('бросает ошибку, если блок невалиден', async () => {
    const chat = chatReturning('не json вовсе')
    await expect(
      regenerateActivity(
        { input, skeleton, stage: { kind: 'main', title: 'Основа', duration_min: 10 }, targetType: 'task', runningContext: '' },
        { chat },
      ),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm exec vitest run tests/lib/scenario/regenerate.test.ts`
Expected: FAIL (новый контракт `regenerateActivity` ещё не реализован; старый `buildActivityMessages`-импорт отсутствует).

- [ ] **Step 3: Переписать `lib/scenario/regenerate.ts`**

Заменить весь файл на:

```typescript
import { chatCompletion } from '@/lib/gigachat/client'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { type Activity, generateBlockWithGate } from './block-gen'
import { coerceActivityType } from './coerce'
import { buildBlockMessages, type RagChunkForPrompt } from './prompt'
import type { GenerationInput, ScenarioSkeleton } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type RegenerateArgs = {
  input: GenerationInput
  skeleton: ScenarioSkeleton
  stage: { kind: string; title: string; duration_min: number }
  targetType: string
  runningContext: string
}

export type RegenerateDeps = { chat?: ChatFn; ragChunks?: RagChunkForPrompt[] }

// Регенерация ОДНОЙ активности тем же per-block пайплайном, что и полная генерация:
// роль этапа + основные смыслы + катящийся контекст соседних блоков + гейт качества.
// Итоговый тип форсится по выбору учителя (защита от «игры во введении»).
export async function regenerateActivity(
  args: RegenerateArgs,
  deps: RegenerateDeps = {},
): Promise<Activity> {
  const chat = deps.chat ?? chatCompletion
  const brief = { type: args.targetType, focus: args.stage.title }
  const msgs = buildBlockMessages(
    args.input,
    args.skeleton,
    args.stage,
    brief,
    deps.ragChunks ?? [],
    args.runningContext,
  )
  const res = await generateBlockWithGate(chat, msgs, args.stage.kind)
  if (!res) throw new Error('GigaChat вернул невалидный блок при регенерации')
  return { ...res.value, type: coerceActivityType(args.targetType) as Activity['type'] }
}
```

- [ ] **Step 4: Запустить тест — пройдёт**

Run: `pnpm exec vitest run tests/lib/scenario/regenerate.test.ts`
Expected: PASS (3 теста).

Примечание: `pnpm tsc --noEmit` временно покажет ошибку в `actions.ts` (старый вызов `regenerateActivity`) — чинится в Task 3. Не блокер для этой задачи.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/regenerate.ts tests/lib/scenario/regenerate.test.ts
git commit -m "feat(regenerate): per-block промпт + гейт + форс выбранного типа (#22, #31)"
```

---

## Task 3: Прокинуть тип и контекст в server action

**Files:**
- Modify: `app/app/scenarios/[id]/actions.ts`

- [ ] **Step 1: Обновить импорты и вызов**

В `app/app/scenarios/[id]/actions.ts`:

(a) Добавить импорты (рядом с существующими):
```typescript
import { type GeneratedBlock, buildRunningContext } from '@/lib/scenario/context'
import { coerceActivityType } from '@/lib/scenario/coerce'
import type { ScenarioSkeleton } from '@/lib/scenario/schema'
```

(b) Изменить сигнатуру `regenerateActivityAction` — добавить 4-й параметр `type`:
```typescript
export async function regenerateActivityAction(
  scenarioId: string,
  stageIndex: number,
  activityIndex: number,
  type: string,
): Promise<RegenResult> {
```

(c) Заменить блок вызова `regenerateActivity` (внутри `try`, строки с `const activity = await regenerateActivity({...}, { ragChunks })`) на:

```typescript
    const targetType = coerceActivityType(type)
    const skeleton: ScenarioSkeleton = {
      title: content.title,
      goals: content.goals,
      values: content.values,
      coreMeanings: content.coreMeanings,
      materials: content.materials,
      adaptations: content.adaptations,
      stages: content.stages.map((s) => ({
        kind: s.kind,
        title: s.title,
        duration_min: s.duration_min,
      })),
    }
    const siblings: GeneratedBlock[] = []
    content.stages.forEach((s, si) => {
      s.activities.forEach((a, ai) => {
        if (si === stageIndex && ai === activityIndex) return
        siblings.push({ stageTitle: s.title, type: a.type, text: a.text })
      })
    })
    const activity = await regenerateActivity(
      {
        input: {
          direction: owned.direction,
          grade: owned.grade,
          topic: owned.topic,
          durationMin: owned.durationMin,
          format: owned.format,
        },
        skeleton,
        stage: { kind: stage.kind, title: stage.title, duration_min: stage.duration_min },
        targetType,
        runningContext: buildRunningContext(siblings),
      },
      { ragChunks },
    )
```

(Остальное в `try`/`catch` — лог в `generations`, возврат `{ ok: true, activity }` — без изменений. `owned.direction/grade/topic/format/durationMin` доступны: `loadOwned` делает `select()` всех колонок.)

- [ ] **Step 2: Гейт типов**

Run: `pnpm exec tsc --noEmit`
Expected: чисто (actions.ts теперь зовёт новый контракт; единственный оставшийся потребитель — editor.tsx, чинится в Task 4, но он передаёт лишний аргумент — это НЕ ошибка типов на стороне actions; проверить, что tsc не падает на actions.ts. Если падает на editor.tsx из-за отсутствующего 4-го арг — это ожидаемо до Task 4).

Примечание: вызов `regenerateActivityAction(meta.id, si, ai)` в editor.tsx без 4-го аргумента даст ошибку tsc (обязательный параметр). Это чинится в Task 4 — допустимо, что полный `tsc` не зелёный между Task 3 и Task 4. Гейт ЭТОЙ задачи: `actions.ts` сам по себе типизируется (нет ошибок внутри файла).

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/[id]/actions.ts
git commit -m "feat(actions): regenerate принимает тип + реконструкция skeleton/контекста"
```

---

## Task 4: Селектор типа у 🎲 в редакторе

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx`

- [ ] **Step 1: Добавить состояние выбора типа и список типов**

В `editor.tsx` рядом с `const [regenKey, setRegenKey] = useState<string | null>(null)` (≈ строка 47) добавить:

```typescript
  const [regenType, setRegenType] = useState<Record<string, string>>({})
```

Рядом с верхними константами файла (после импортов) добавить список типов с русскими подписями:

```typescript
const ACTIVITY_TYPE_LABELS: Array<{ value: string; label: string }> = [
  { value: 'discussion', label: 'Беседа / обсуждение' },
  { value: 'quiz', label: 'Квиз' },
  { value: 'game', label: 'Игра' },
  { value: 'task', label: 'Задание' },
  { value: 'video', label: 'Видео / презентация' },
]
```

- [ ] **Step 2: Обновить функцию `regen` — принимать тип**

Заменить функцию `regen` (≈ строки 103-116) на:

```typescript
  function regen(si: number, ai: number, type: string) {
    const key = `${si}-${ai}`
    setRegenKey(key)
    setMessage(null)
    startTransition(async () => {
      const res = await regenerateActivityAction(meta.id, si, ai, type)
      if (res.ok) {
        setActivity(si, ai, res.activity)
      } else {
        setMessage(res.error)
      }
      setRegenKey(null)
    })
  }
```

- [ ] **Step 3: Добавить `<select>` рядом с кнопкой 🎲**

В разметке активности (≈ строки 356-397, блок `<span className="flex items-center gap-1">`), ПЕРЕД кнопкой 🎲 вставить селектор, и обновить `onClick` кнопки 🎲 на передачу выбранного типа. Заменить блок кнопки 🎲:

```tsx
                        <select
                          className="rounded-md border border-neutral-200 bg-neutral-0 px-2 py-1 text-xs text-neutral-700"
                          value={regenType[`${si}-${ai}`] ?? a.type}
                          disabled={pending}
                          onChange={(e) =>
                            setRegenType((m) => ({ ...m, [`${si}-${ai}`]: e.target.value }))
                          }
                          aria-label="Тип для регенерации"
                        >
                          {ACTIVITY_TYPE_LABELS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => regen(si, ai, regenType[`${si}-${ai}`] ?? a.type)}
                          aria-label="Заменить активность"
                        >
                          {busy ? '…' : '🎲'}
                        </Button>
```

- [ ] **Step 4: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: чисто; `regenerateActivityAction` теперь зовётся с 4 аргументами везде.

- [ ] **Step 5: Commit**

```bash
git add app/app/scenarios/[id]/editor.tsx
git commit -m "feat(ui): выбор типа активности при регенерации (#31)"
```

---

## Task 5: Финальная сверка + статус-доки

**Files:**
- Modify: `CLAUDE.md`, `docs/backlog.md`

- [ ] **Step 1: Полный гейт**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное (272+ тестов; новый block-gen.test добавляет проверки).

- [ ] **Step 2: Греп на осиротевшее**

Run: `grep -rn "buildActivityMessages\|ACTIVITY_SCHEMA_HINT" lib app components tests`
Expected: пусто (удалены вместе со старым `regenerate.ts`). Если что-то осталось — починить.

- [ ] **Step 3: Обновить `docs/backlog.md`**

Перевести #22 и #31 в «Сделано» (или пометить выполненными) с пояснением: regenerate переведён на per-block (`buildBlockMessages` + общий `generateBlockWithGate`), тип выбирается учителем и форсится, гейт качества как в генерации.

- [ ] **Step 4: Обновить `CLAUDE.md`**

Добавить в «Пост-milestone изменения» пункт про регенерацию на per-block (общий хелпер `block-gen.ts`, выбор+форс типа, гейт), отметить ручной UAT (🎲 на введении с типом «беседа» → беседа, не игра).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: регенерация на per-block — статус #22/#31"
```

---

## Ручные шаги (вне кода)
- **Живой UAT:** в редакторе 🎲 на введении с типом «Беседа» → получить вводную беседу РоВ-глубины (не игру); 🎲 в основной части со сменой типа на «Игра» → получить игру. Проверить, что тип в итоге = выбранному.

## Риски (из спеки)
- Латентность регенерации до ~3 вызовов (гейт-ретраи) — принято; rate-limit `MAX_REGEN_PER_DAY` ограничивает.
- Вынос хелпера из stream.ts — регрессия генерации снимается зелёным `stream.test.ts`.
- `checkBlock` для game/quiz в main применяет правило «≥2 Учитель:» — существующее поведение, не новый риск.
