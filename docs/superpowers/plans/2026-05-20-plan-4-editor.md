# Plan 4 — Редактор сценария Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить read-only просмотр `/app/scenarios/[id]` в структурный блочный редактор: правка полей, reorder этапов и активностей кнопками ↑/↓, точечная регенерация активности через GigaChat+RAG, explicit save со снапшотом версии.

**Architecture:** Контент сценария — строго структурный `ScenarioContent` (zod). Серверный компонент страницы делает auth + выборку с изоляцией по `user_id` и рендерит клиентский `ScenarioEditor`, который держит черновик в локальном state. Нетривиальная логика вынесена в чистые модули `lib/scenario/edit-ops.ts` (reorder) и `lib/scenario/regenerate.ts` (одна активность через GigaChat) — обе под TDD. Server actions (`save`, `regenerate-activity`) — тонкий glue: проверка владения, zod-валидация, запись `scenarios.content` + снапшот в `scenario_versions`. Авто-сейва нет (explicit save). Экспорт/лайк/шаринг/календарь — вне этой фазы.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), TypeScript, Drizzle, zod, GigaChat client (уже есть), RAG retrieve (уже есть), Tailwind + собственные ui-примитивы. Тесты — Vitest. Менеджер pnpm, линт Biome.

**Out of scope (явно не делаем в Plan 4):** добавление/удаление этапов и активностей (только правка существующих + reorder + regen); авто-сейв; rate-limit на регенерацию (тех-долг Plan 8); кнопки тулбара Лайк/Поделиться/PDF/DOCX/На дату (Plan 5+); rich-text/TipTap/HTML (контент остаётся структурным, без XSS-поверхности); версионная история UI (снапшоты пишем, но экран истории не делаем).

---

## File Structure

- **Create** `lib/scenario/edit-ops.ts` — чистые функции reorder: `moveStage`, `moveActivity`. Иммутабельны, out-of-bounds → возврат без изменений.
- **Create** `tests/lib/scenario/edit-ops.test.ts` — юнит-тесты reorder.
- **Create** `lib/scenario/regenerate.ts` — `buildActivityMessages` + `regenerateActivity` (одна активность, GigaChat, repair-pass, валидация `activitySchema`). DI для `chat`.
- **Create** `tests/lib/scenario/regenerate.test.ts` — юнит-тесты с моком chat.
- **Create** `components/ui/textarea.tsx` — примитив textarea в стиле `input.tsx`.
- **Create** `app/app/scenarios/[id]/actions.ts` — server actions `saveScenarioAction`, `regenerateActivityAction`.
- **Create** `app/app/scenarios/[id]/editor.tsx` — клиентский `ScenarioEditor` (блочный редактор).
- **Modify** `app/app/scenarios/[id]/page.tsx` — серверный компонент: auth + выборка, рендер `<ScenarioEditor>`.

---

### Task 1: Чистые функции reorder (`edit-ops.ts`)

**Files:**
- Create: `lib/scenario/edit-ops.ts`
- Test: `tests/lib/scenario/edit-ops.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/lib/scenario/edit-ops.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { moveActivity, moveStage } from '@/lib/scenario/edit-ops'

const base: ScenarioContent = {
  title: 'T',
  goals: ['g'],
  materials: [],
  stages: [
    {
      kind: 'engage',
      title: 'S0',
      duration_min: 5,
      activities: [
        { type: 'discussion', text: 'a0' },
        { type: 'task', text: 'a1' },
      ],
    },
    { kind: 'main', title: 'S1', duration_min: 10, activities: [{ type: 'game', text: 'b0' }] },
    { kind: 'reflection', title: 'S2', duration_min: 5, activities: [{ type: 'task', text: 'c0' }] },
  ],
  adaptations: { simpler: 's', harder: 'h' },
}

describe('moveStage', () => {
  it('перемещает этап вниз', () => {
    const r = moveStage(base, 0, 1)
    expect(r.stages.map((s) => s.title)).toEqual(['S1', 'S0', 'S2'])
  })
  it('перемещает этап вверх', () => {
    const r = moveStage(base, 2, -1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S2', 'S1'])
  })
  it('out-of-bounds (вверх с 0) → без изменений', () => {
    const r = moveStage(base, 0, -1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
  it('out-of-bounds (вниз с последнего) → без изменений', () => {
    const r = moveStage(base, 2, 1)
    expect(r.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
  it('не мутирует вход', () => {
    moveStage(base, 0, 1)
    expect(base.stages.map((s) => s.title)).toEqual(['S0', 'S1', 'S2'])
  })
})

describe('moveActivity', () => {
  it('перемещает активность внутри этапа', () => {
    const r = moveActivity(base, 0, 0, 1)
    expect(r.stages[0].activities.map((a) => a.text)).toEqual(['a1', 'a0'])
  })
  it('out-of-bounds → без изменений', () => {
    const r = moveActivity(base, 0, 0, -1)
    expect(r.stages[0].activities.map((a) => a.text)).toEqual(['a0', 'a1'])
  })
  it('не трогает другие этапы', () => {
    const r = moveActivity(base, 0, 1, -1)
    expect(r.stages[1].activities.map((a) => a.text)).toEqual(['b0'])
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm vitest run tests/lib/scenario/edit-ops.test.ts`
Expected: FAIL (Cannot find module '@/lib/scenario/edit-ops').

- [ ] **Step 3: Реализовать минимум**

`lib/scenario/edit-ops.ts`:
```ts
import type { ScenarioContent } from './schema'

function swap<T>(arr: T[], i: number, j: number): T[] {
  const copy = arr.slice()
  const tmp = copy[i]
  copy[i] = copy[j]
  copy[j] = tmp
  return copy
}

export function moveStage(content: ScenarioContent, index: number, dir: -1 | 1): ScenarioContent {
  const target = index + dir
  if (target < 0 || target >= content.stages.length) return content
  return { ...content, stages: swap(content.stages, index, target) }
}

export function moveActivity(
  content: ScenarioContent,
  stageIndex: number,
  activityIndex: number,
  dir: -1 | 1,
): ScenarioContent {
  const stage = content.stages[stageIndex]
  if (!stage) return content
  const target = activityIndex + dir
  if (target < 0 || target >= stage.activities.length) return content
  const stages = content.stages.slice()
  stages[stageIndex] = { ...stage, activities: swap(stage.activities, activityIndex, target) }
  return { ...content, stages }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm vitest run tests/lib/scenario/edit-ops.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Гейты + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit`
```bash
git add lib/scenario/edit-ops.ts tests/lib/scenario/edit-ops.test.ts
git commit -m "feat(editor): pure reorder ops for stages and activities"
```

---

### Task 2: Регенерация одной активности (`regenerate.ts`)

**Files:**
- Create: `lib/scenario/regenerate.ts`
- Test: `tests/lib/scenario/regenerate.test.ts`

**Контекст:** переиспользуем паттерн из `lib/scenario/generate.ts` (extractJson, repair-pass, DI `chat`). `ChatResult`/`GigaMessage` — из `@/lib/gigachat/types`. `activitySchema` и тип активности — из `./schema`. `RagChunkForPrompt` — из `./prompt`.

- [ ] **Step 1: Написать падающий тест**

`tests/lib/scenario/regenerate.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { buildActivityMessages, regenerateActivity } from '@/lib/scenario/regenerate'

const args = {
  scenario: {
    direction: 'Гражданское',
    grade: 5,
    topic: 'Дружба',
    format: 'классный час',
    title: 'О дружбе',
  },
  stage: { kind: 'main' as const, title: 'Основная часть' },
  current: { type: 'discussion' as const, text: 'старый вопрос' },
}

function chatReturning(content: string) {
  return vi.fn(async (_m: GigaMessage[]): Promise<ChatResult> => ({ content, usage: null }))
}

describe('buildActivityMessages', () => {
  it('включает тему, этап и текущую активность', () => {
    const msgs = buildActivityMessages(args, [])
    const joined = msgs.map((m) => m.content).join('\n')
    expect(joined).toContain('Дружба')
    expect(joined).toContain('Основная часть')
    expect(joined).toContain('старый вопрос')
  })
  it('включает RAG-фрагменты, если переданы', () => {
    const msgs = buildActivityMessages(args, [
      { text: 'методичка про дружбу', documentTitle: 'Док', sectionKind: 'main' },
    ])
    expect(msgs.map((m) => m.content).join('\n')).toContain('методичка про дружбу')
  })
})

describe('regenerateActivity', () => {
  it('парсит валидную активность из JSON', async () => {
    const chat = chatReturning(
      JSON.stringify({ type: 'game', text: 'новая игра', questions: ['Q1?'] }),
    )
    const result = await regenerateActivity(args, { chat })
    expect(result).toEqual({ type: 'game', text: 'новая игра', questions: ['Q1?'] })
    expect(chat).toHaveBeenCalledTimes(1)
  })
  it('извлекает JSON из markdown-fence', async () => {
    const chat = chatReturning('```json\n{"type":"task","text":"задача"}\n```')
    const result = await regenerateActivity(args, { chat })
    expect(result.type).toBe('task')
  })
  it('делает repair-pass при невалидном первом ответе', async () => {
    const chat = vi
      .fn<(m: GigaMessage[]) => Promise<ChatResult>>()
      .mockResolvedValueOnce({ content: 'не json', usage: null })
      .mockResolvedValueOnce({ content: '{"type":"quiz","text":"квиз"}', usage: null })
    const result = await regenerateActivity(args, { chat })
    expect(result.text).toBe('квиз')
    expect(chat).toHaveBeenCalledTimes(2)
  })
  it('бросает ошибку, если и repair невалиден', async () => {
    const chat = chatReturning('мусор')
    await expect(regenerateActivity(args, { chat })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm vitest run tests/lib/scenario/regenerate.test.ts`
Expected: FAIL (Cannot find module '@/lib/scenario/regenerate').

- [ ] **Step 3: Реализовать минимум**

`lib/scenario/regenerate.ts`:
```ts
import { chatCompletion } from '@/lib/gigachat/client'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import type { ChatMessage, RagChunkForPrompt } from './prompt'
import { type ScenarioStage, activitySchema } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type RegenerateArgs = {
  scenario: { direction: string; grade: number; topic: string; format: string; title: string }
  stage: { kind: ScenarioStage['kind']; title: string }
  current: ScenarioStage['activities'][number]
}

const ACTIVITY_SCHEMA_HINT = `Структура JSON одной активности (строго ключи и типы):
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  "text": string,            // что делает педагог/дети, конкретно
  "questions"?: string[]     // конкретные вопросы, не общие
}`

export function buildActivityMessages(
  args: RegenerateArgs,
  ragChunks: RagChunkForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Тебе нужно предложить НОВЫЙ вариант ОДНОЙ активности занятия взамен текущей.',
    'Правила: возрастная адаптация, активная роль детей, конкретные вопросы (не общие).',
    'Никогда не используй реальные имена детей или персональные данные.',
    '',
    ACTIVITY_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект одной активности по схеме. Никакого текста до или после.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся, но не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const user = [
    'Контекст занятия:',
    `- Направление: ${args.scenario.direction}`,
    `- Класс: ${args.scenario.grade}`,
    `- Тема: ${args.scenario.topic}`,
    `- Формат: ${args.scenario.format}`,
    `- Название сценария: ${args.scenario.title}`,
    `- Этап: «${args.stage.title}» (${args.stage.kind})`,
    '',
    'Текущая активность, которую нужно заменить на новый вариант:',
    `тип: ${args.current.type}`,
    `текст: ${args.current.text}`,
    ...(args.current.questions?.length ? [`вопросы: ${args.current.questions.join(' | ')}`] : []),
    ...methodology,
    '',
    'Сгенерируй другой по содержанию, но уместный вариант активности для этого этапа.',
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function extractJson(raw: string): unknown {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('JSON не найден')
  return JSON.parse(s.slice(start, end + 1))
}

function tryParse(raw: string) {
  try {
    return activitySchema.safeParse(extractJson(raw))
  } catch {
    return null
  }
}

export type RegenerateDeps = { chat?: ChatFn }

export async function regenerateActivity(args: RegenerateArgs, deps: RegenerateDeps = {}) {
  const chat = deps.chat ?? chatCompletion
  const messages = buildActivityMessages(args)

  const first = await chat(messages, { temperature: 0.7 })
  let parsed = tryParse(first.content)

  if (!parsed?.success) {
    const repairMessages: GigaMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content:
          'Ответ был невалидным. Верни ТОЛЬКО валидный JSON одной активности по схеме, без markdown.',
      },
    ]
    const second = await chat(repairMessages, { temperature: 0.3 })
    parsed = tryParse(second.content)
  }

  if (!parsed?.success) throw new Error('GigaChat вернул невалидную активность после repair')
  return parsed.data
}
```

Примечание: `buildActivityMessages` в Step 3 пока без RAG в боевом пути `regenerateActivity` — чанки прокидывает server action (Task 4) через отдельный вызов `buildActivityMessages` не нужен; для простоты RAG подаётся внутри action перед вызовом. **Уточнение:** чтобы RAG реально доходил до LLM, `regenerateActivity` должен принимать готовые чанки. Реализуй так:

```ts
export type RegenerateDeps = { chat?: ChatFn; ragChunks?: RagChunkForPrompt[] }

export async function regenerateActivity(args: RegenerateArgs, deps: RegenerateDeps = {}) {
  const chat = deps.chat ?? chatCompletion
  const messages = buildActivityMessages(args, deps.ragChunks ?? [])
  // ...остальное без изменений
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm vitest run tests/lib/scenario/regenerate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Гейты + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit`
```bash
git add lib/scenario/regenerate.ts tests/lib/scenario/regenerate.test.ts
git commit -m "feat(editor): single-activity regeneration via GigaChat with RAG and repair-pass"
```

---

### Task 3: Примитив `Textarea`

**Files:**
- Create: `components/ui/textarea.tsx`

**Контекст:** в `components/ui/` нет textarea. Зеркалим стиль `input.tsx` (тот же ring/focus/радиусы дизайн-системы). Перед реализацией прочитай `components/ui/input.tsx` и повтори его className/паттерн `forwardRef`.

- [ ] **Step 1: Реализовать примитив**

`components/ui/textarea.tsx` (className скопируй из `input.tsx`, заменив тег на `textarea` и добавив `min-h`):
```tsx
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        // ВАЖНО: вставь сюда тот же набор классов, что в components/ui/input.tsx,
        // плюс 'min-h-[72px] resize-y'
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
```

Реализатор: открой `components/ui/input.tsx`, скопируй точный className из него в `cn(...)` выше (вместо комментария), добавив `'min-h-[72px] resize-y'`. Проверь, что `@/lib/utils` экспортирует `cn` (он используется в input.tsx).

- [ ] **Step 2: Гейты + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: build OK (компонент пока не импортируется — это нормально, проверяем компиляцию).
```bash
git add components/ui/textarea.tsx
git commit -m "feat(ui): textarea primitive matching input style"
```

---

### Task 4: Server actions (`save` + `regenerate-activity`)

**Files:**
- Create: `app/app/scenarios/[id]/actions.ts`

**Контекст:** паттерн владения и записи версий — из `app/app/new/actions.ts`. RAG retrieve — `retrieveChunks` из `@/lib/rag/retrieve` (сигнатура: принимает `{ direction, grade, topic }`, возвращает массив `{ id, chunkText, documentTitle, sectionKind }`). Изоляция данных: КАЖДАЯ выборка `scenarios` — с `eq(scenarios.userId, session.user.id)` (критерий жюри, см. CLAUDE.md).

- [ ] **Step 1: Реализовать actions**

`app/app/scenarios/[id]/actions.ts`:
```ts
'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { generations, scenarioVersions, scenarios } from '@/db/schema'
import { retrieveChunks } from '@/lib/rag/retrieve'
import type { RagChunkForPrompt } from '@/lib/scenario/prompt'
import { regenerateActivity } from '@/lib/scenario/regenerate'
import { type ScenarioContent, scenarioContentSchema } from '@/lib/scenario/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function loadOwned(scenarioId: string, userId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1)
  return row ?? null
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveScenarioAction(
  scenarioId: string,
  rawContent: unknown,
): Promise<SaveResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const parsed = scenarioContentSchema.safeParse(rawContent)
  if (!parsed.success) return { ok: false, error: 'Сценарий не прошёл валидацию' }

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const content: ScenarioContent = parsed.data
  await db
    .update(scenarios)
    .set({ title: content.title, content, updatedAt: new Date() })
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
  await db.insert(scenarioVersions).values({ scenarioId, content })

  revalidatePath(`/app/scenarios/${scenarioId}`)
  return { ok: true }
}

export type RegenResult =
  | { ok: true; activity: ScenarioContent['stages'][number]['activities'][number] }
  | { ok: false; error: string }

export async function regenerateActivityAction(
  scenarioId: string,
  stageIndex: number,
  activityIndex: number,
): Promise<RegenResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const owned = await loadOwned(scenarioId, userId)
  if (!owned) return { ok: false, error: 'Сценарий не найден' }

  const content = owned.content
  const stage = content.stages[stageIndex]
  const current = stage?.activities[activityIndex]
  if (!stage || !current) return { ok: false, error: 'Активность не найдена' }

  let ragChunks: RagChunkForPrompt[] = []
  try {
    const found = await retrieveChunks({
      direction: owned.direction,
      grade: owned.grade,
      topic: owned.topic,
    })
    ragChunks = found.map((c) => ({
      text: c.chunkText,
      documentTitle: c.documentTitle,
      sectionKind: c.sectionKind,
    }))
  } catch (e) {
    console.error('RAG retrieval failed for regenerate (non-fatal):', e)
  }

  try {
    const activity = await regenerateActivity(
      {
        scenario: {
          direction: owned.direction,
          grade: owned.grade,
          topic: owned.topic,
          format: owned.format,
          title: content.title,
        },
        stage: { kind: stage.kind, title: stage.title },
        current,
      },
      { ragChunks },
    )
    await db
      .insert(generations)
      .values({ userId, scenarioId, latencyMs: null, status: 'ok' })
      .catch(() => {})
    return { ok: true, activity }
  } catch (e) {
    await db
      .insert(generations)
      .values({ userId, scenarioId, latencyMs: null, status: 'error' })
      .catch(() => {})
    console.error('regenerateActivityAction failed:', e)
    return { ok: false, error: 'Не удалось перегенерировать активность' }
  }
}
```

- [ ] **Step 2: Гейты + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: build OK.
```bash
git add app/app/scenarios/\[id\]/actions.ts
git commit -m "feat(editor): save + regenerate-activity server actions with ownership checks"
```

---

### Task 5: Клиентский редактор (`editor.tsx`)

**Files:**
- Create: `app/app/scenarios/[id]/editor.tsx`

**Контекст:** держит черновик `content` в `useState`, инициализируется из props. Поля редактируемые (title, goals[], materials[], stage.title, stage.duration_min, activity.text, activity.questions[]). Reorder этапов и активностей — через `moveStage`/`moveActivity` из `@/lib/scenario/edit-ops`. Кнопка 🎲 на активности → `regenerateActivityAction`. Кнопка «Сохранить» → `saveScenarioAction`. Dirty-флаг: сравниваем JSON черновика с последним сохранённым. Тип `EditableActivityType` — из `activitySchema` enum значений.

Дизайн: используем `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input`, `Label`, `Textarea`. Бейджи метаданных и заголовок — как в текущем `page.tsx`. Палитра brand/neutral по дизайн-системе.

- [ ] **Step 1: Реализовать компонент**

`app/app/scenarios/[id]/editor.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { moveActivity, moveStage } from '@/lib/scenario/edit-ops'
import type { ScenarioContent } from '@/lib/scenario/schema'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { regenerateActivityAction, saveScenarioAction } from './actions'

const KIND_LABEL: Record<string, string> = {
  engage: 'Вовлечение',
  main: 'Основная часть',
  reflection: 'Рефлексия',
}

type Meta = { id: string; direction: string; grade: number; durationMin: number; format: string }

export function ScenarioEditor({
  meta,
  initialContent,
}: {
  meta: Meta
  initialContent: ScenarioContent
}) {
  const [content, setContent] = useState<ScenarioContent>(initialContent)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialContent))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [regenKey, setRegenKey] = useState<string | null>(null)

  const dirty = JSON.stringify(content) !== savedJson

  function update(fn: (c: ScenarioContent) => ScenarioContent) {
    setContent((c) => fn(c))
  }

  function setStage(i: number, patch: Partial<ScenarioContent['stages'][number]>) {
    update((c) => {
      const stages = c.stages.slice()
      stages[i] = { ...stages[i], ...patch }
      return { ...c, stages }
    })
  }

  function setActivity(
    si: number,
    ai: number,
    patch: Partial<ScenarioContent['stages'][number]['activities'][number]>,
  ) {
    update((c) => {
      const stages = c.stages.slice()
      const activities = stages[si].activities.slice()
      activities[ai] = { ...activities[ai], ...patch }
      stages[si] = { ...stages[si], activities }
      return { ...c, stages }
    })
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const res = await saveScenarioAction(meta.id, content)
      if (res.ok) {
        setSavedJson(JSON.stringify(content))
        setMessage('Сохранено')
      } else {
        setMessage(res.error)
      }
    })
  }

  function regen(si: number, ai: number) {
    const key = `${si}-${ai}`
    setRegenKey(key)
    setMessage(null)
    startTransition(async () => {
      const res = await regenerateActivityAction(meta.id, si, ai)
      if (res.ok) {
        setActivity(si, ai, res.activity)
      } else {
        setMessage(res.error)
      }
      setRegenKey(null)
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Input
            value={content.title}
            onChange={(e) => update((c) => ({ ...c, title: e.target.value }))}
            className="text-2xl font-semibold"
            aria-label="Название сценария"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[meta.direction, `${meta.grade} класс`, `${meta.durationMin} мин`, meta.format].map(
              (b) => (
                <span
                  key={b}
                  className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 ring-1 ring-brand-200"
                >
                  {b}
                </span>
              ),
            )}
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
        <CardContent className="space-y-2">
          {content.goals.map((g, i) => (
            <Input
              key={`goal-${i}`}
              value={g}
              onChange={(e) =>
                update((c) => {
                  const goals = c.goals.slice()
                  goals[i] = e.target.value
                  return { ...c, goals }
                })
              }
            />
          ))}
        </CardContent>
      </Card>

      {content.materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Материалы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.materials.map((m, i) => (
              <Input
                key={`mat-${i}`}
                value={m}
                onChange={(e) =>
                  update((c) => {
                    const materials = c.materials.slice()
                    materials[i] = e.target.value
                    return { ...c, materials }
                  })
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {content.stages.map((stage, si) => (
          <Card key={`stage-${si}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <Input
                  value={stage.title}
                  onChange={(e) => setStage(si, { title: e.target.value })}
                  className="text-base font-medium"
                  aria-label="Заголовок этапа"
                />
                <span className="flex shrink-0 items-center gap-2 text-sm font-normal text-neutral-500">
                  {KIND_LABEL[stage.kind] ?? stage.kind}
                  <Input
                    type="number"
                    min={1}
                    value={stage.duration_min}
                    onChange={(e) =>
                      setStage(si, { duration_min: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-16"
                    aria-label="Минут на этап"
                  />
                  мин
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={si === 0}
                    onClick={() => update((c) => moveStage(c, si, -1))}
                    aria-label="Этап выше"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={si === content.stages.length - 1}
                    onClick={() => update((c) => moveStage(c, si, 1))}
                    aria-label="Этап ниже"
                  >
                    ↓
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stage.activities.map((a, ai) => {
                const busy = pending && regenKey === `${si}-${ai}`
                return (
                  <div key={`act-${si}-${ai}`} className="rounded-md bg-neutral-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-neutral-400">
                        {a.type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={ai === 0}
                          onClick={() => update((c) => moveActivity(c, si, ai, -1))}
                          aria-label="Активность выше"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={ai === stage.activities.length - 1}
                          onClick={() => update((c) => moveActivity(c, si, ai, 1))}
                          aria-label="Активность ниже"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => regen(si, ai)}
                          aria-label="Заменить активность"
                        >
                          {busy ? '…' : '🎲'}
                        </Button>
                      </span>
                    </div>
                    <Textarea
                      value={a.text}
                      onChange={(e) => setActivity(si, ai, { text: e.target.value })}
                      aria-label="Текст активности"
                    />
                    {a.questions && a.questions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {a.questions.map((q, qi) => (
                          <Input
                            key={`q-${si}-${ai}-${qi}`}
                            value={q}
                            onChange={(e) =>
                              setActivity(si, ai, {
                                questions: a.questions?.map((x, k) =>
                                  k === qi ? e.target.value : x,
                                ),
                              })
                            }
                            aria-label="Вопрос"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Адаптация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="font-medium text-neutral-900">Проще: </span>
            <Textarea
              value={content.adaptations.simpler}
              onChange={(e) =>
                update((c) => ({ ...c, adaptations: { ...c.adaptations, simpler: e.target.value } }))
              }
              aria-label="Адаптация проще"
            />
          </div>
          <div>
            <span className="font-medium text-neutral-900">Сложнее: </span>
            <Textarea
              value={content.adaptations.harder}
              onChange={(e) =>
                update((c) => ({ ...c, adaptations: { ...c.adaptations, harder: e.target.value } }))
              }
              aria-label="Адаптация сложнее"
            />
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-neutral-500">
            {message ?? (dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}
          </span>
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Гейты + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: build OK (компонент пока не используется страницей — это нормально).
```bash
git add app/app/scenarios/\[id\]/editor.tsx
git commit -m "feat(editor): structured block editor with reorder, field editing, save and regen"
```

---

### Task 6: Подключить редактор к странице

**Files:**
- Modify: `app/app/scenarios/[id]/page.tsx`

**Контекст:** заменяем read-only рендер на серверную выборку + `<ScenarioEditor>`. Auth + изоляция по `user_id` сохраняем без изменений.

- [ ] **Step 1: Переписать page.tsx**

`app/app/scenarios/[id]/page.tsx`:
```tsx
import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { ScenarioEditor } from './editor'

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

  return (
    <ScenarioEditor
      meta={{
        id: scenario.id,
        direction: scenario.direction,
        grade: scenario.grade,
        durationMin: scenario.durationMin,
        format: scenario.format,
      }}
      initialContent={scenario.content}
    />
  )
}
```

- [ ] **Step 2: Гейты + commit**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: тесты зелёные (≥75 passed, 3 guarded-live skip), build OK.
```bash
git add app/app/scenarios/\[id\]/page.tsx
git commit -m "feat(editor): wire structured editor into scenario page"
```

---

### Task 7: Финальное холистическое ревью + manual UAT + тег

- [ ] **Step 1: Холистическое ревью** — `superpowers:requesting-code-review` по всему диффу `rag-done..HEAD`. Проверить: изоляция `user_id` во всех выборках; zod-валидация на сохранении; отсутствие raw SQL без `WHERE user_id`; нет HTML/XSS-поверхности; нет авто-сейва (explicit save); reorder иммутабелен.

- [ ] **Step 2: Manual UAT в браузере** (golden path демо-петли):
  1. `pnpm db:up && pnpm db:migrate` (если БД не поднята), `pnpm dev`.
  2. Залогиниться, сгенерировать сценарий на `/app/new`, перейти в `/app/scenarios/[id]`.
  3. Отредактировать заголовок/цель/текст активности → бейдж «Есть несохранённые изменения» → «Сохранить» → «Сохранено».
  4. Перезагрузить страницу → правки на месте (версия записана).
  5. ↑/↓ на этапе и на активности → порядок меняется, кнопки на границах disabled.
  6. 🎲 на активности → приходит новый текст (нужен живой GigaChat-ключ), правка считается dirty → сохранить.
  7. Проверить, что чужой сценарий (другой user_id) даёт 404.

  Если UI протестировать нельзя (нет ключа/БД) — явно сказать об этом, не заявлять успех.

- [ ] **Step 3: Обновить статус в CLAUDE.md** — отметить Plan 4 готовым, зафиксировать тех-долг (rate-limit на regen → Plan 8; добавление/удаление блоков — не реализовано). Commit.

- [ ] **Step 4: Тег**
```bash
git tag editor-done
```

---

## Self-Review

**Spec coverage (§5 шаг [8], §8 Step 4, §12):**
- DoD «Редактор сценария (TipTap-блоки, ↑/↓, точечная регенерация активности)» → Tasks 1 (reorder), 2+4 (regen), 5 (блочный редактор). Отступление от буквы «TipTap» согласовано с пользователем (структурный блочный, без HTML/XSS).
- §5 [8] «новая запись в scenario_versions» → Task 4 `saveScenarioAction` (снапшот при сохранении). Авто-сейв debounce 2с сознательно заменён на explicit save (согласовано).
- §9 изоляция `WHERE user_id` → Tasks 4, 6 (каждая выборка с `and(eq(id), eq(userId))`).
- Вне scope (export/like/share/calendar/add-delete-blocks/auto-save) — перечислено в шапке, не входит в Plan 4.

**Placeholder scan:** в Task 3 className textarea явно делегирован реализатору (скопировать из input.tsx) — это не placeholder логики, а привязка к существующему стилю; путь и точное действие указаны. Остальные шаги содержат полный код.

**Type consistency:** `ScenarioContent`, `activitySchema`, `RagChunkForPrompt`, `ChatResult`/`GigaMessage`, `retrieveChunks` сигнатуры сверены с `rag-done`. `regenerateActivity` принимает `{ chat, ragChunks }` (финальная сигнатура из Task 2 Step 3 уточнения), action вызывает с `{ ragChunks }`. `saveScenarioAction(id, content)` / `regenerateActivityAction(id, si, ai)` совпадают между Task 4 и Task 5.
