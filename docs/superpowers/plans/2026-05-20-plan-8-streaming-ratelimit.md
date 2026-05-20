# Plan 8 — Streaming генерация (SSE) + Rate-limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести генерацию сценария с single-shot на двухэтапный SSE-стрим (skeleton → details) с прогрессивным UI, и добавить подсистему rate-limit (таблица `rate_buckets` с lazy cleanup + whitelist) на все 5 точек из §9 спеки.

**Architecture:** Стрим строится из переиспользуемых чистых модулей: SSE-парсер буфера, partial-JSON completer, и оркестратор `streamScenario(input, deps)` — async-генератор событий с инъекцией зависимостей (chatStream / retrieve / prematch / save), по образцу существующего `generateScenario(input, deps)`. Route-handler `/api/generate/stream` — тонкий адаптер событий в `text/event-stream`. Клиент читает `res.body` reader и прогрессивно рендерит каркас. Rate-limit — чистые хелперы (`windowStartFor`, `isWhitelisted`) + `checkRateLimit(check, deps)` с инъектируемым `store` (in-memory в тестах, drizzle в проде), lazy DELETE старых корзин при каждом чтении.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM (Postgres+pgvector), Vitest, GigaChat external API (SSE `stream:true`), zod.

**Scope (фиксировано):** ТОЛЬКО стриминг + rate-limit. НЕ входит: календарь, лендинг, CSRF на logout, AUTH_URL derive, мягкий PII-warning при сохранении, скрипт калибровки порога. Базируется на теге `community-loop-done`, ветка `feat/streaming-ratelimit`.

**Конвенции (из CLAUDE.md):** один коммит на задачу; TDD для чистой логики (тесты сначала); юнит-тесты НЕ ходят в живую сеть (стабай `fetch` через `vi.stubGlobal` или инъектируй deps); перед каждым коммитом зелёные гейты — `pnpm test` (baseline 146 pass / 3 skip), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`; UI только на русском.

---

## File Structure

**Создаются:**
- `lib/gigachat/sse.ts` — чистый парсер SSE-буфера (`parseSSEBuffer`)
- `lib/scenario/partial.ts` — partial-JSON completer (`parsePartialJson`)
- `lib/scenario/stream.ts` — оркестратор `streamScenario` (async-генератор `StreamEvent`)
- `app/api/generate/stream/route.ts` — POST SSE route-handler
- `components/generation/GenerationStream.tsx` — клиентский прогрессивный рендер каркаса
- `lib/ratelimit/window.ts` — чистые хелперы (`windowStartFor`, `isWhitelisted`)
- `lib/ratelimit/index.ts` — `checkRateLimit` + типы `RateStore`/`RateCheck`
- `lib/ratelimit/store.ts` — drizzle-backed `dbStore`
- Тесты: `tests/lib/gigachat/sse.test.ts`, `tests/lib/gigachat/stream.test.ts`, `tests/lib/scenario/partial.test.ts`, `tests/lib/scenario/stream.test.ts`, `tests/lib/ratelimit/window.test.ts`, `tests/lib/ratelimit/check.test.ts`

**Модифицируются:**
- `lib/gigachat/client.ts` — добавить `chatCompletionStream`
- `lib/scenario/schema.ts` — добавить `skeletonSchema` / `ScenarioSkeleton`; bump `PROMPT_VERSION` остаётся в prompt.ts
- `lib/scenario/prompt.ts` — добавить `buildSkeletonMessages`, `buildDetailsMessages`, bump `PROMPT_VERSION`
- `db/schema.ts` — таблица `rateBuckets`
- `app/app/new/page.tsx` — переключить путь генерации на стрим, убрать использование `generateScenarioAction`
- `app/app/new/actions.ts` — удалить осиротевший `generateScenarioAction` (prematchAction остаётся)
- `app/(auth)/login/actions.ts` — rate-limit по IP
- `app/app/plans/actions.ts` — rate-limit на `analyzePlanAction`
- `app/app/library/actions.ts` — rate-limit на `searchSharedAction`
- `app/api/scenarios/[id]/export/route.ts` — rate-limit на экспорт
- `.env.example` — задокументировать уже используемые лимиты

---

# PART A — Streaming генерация (SSE)

### Task 1: SSE-парсер буфера (чистая логика, TDD)

GigaChat при `stream:true` отдаёт `text/event-stream`: события разделены `\n\n`, payload в строках `data: {...}`, финал — `data: [DONE]`. Парсер принимает накопленный буфер и возвращает завершённые события + незавершённый хвост (для следующего чтения).

**Files:**
- Create: `lib/gigachat/sse.ts`
- Test: `tests/lib/gigachat/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/gigachat/sse.test.ts
import { describe, expect, it } from 'vitest'
import { parseSSEBuffer } from '@/lib/gigachat/sse'

describe('parseSSEBuffer', () => {
  it('извлекает одно завершённое событие', () => {
    const { events, rest } = parseSSEBuffer('data: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('')
  })

  it('держит незавершённый хвост в rest', () => {
    const { events, rest } = parseSSEBuffer('data: {"a":1}\n\ndata: {"b":2')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b":2')
  })

  it('извлекает несколько событий за раз', () => {
    const { events } = parseSSEBuffer('data: x\n\ndata: y\n\n')
    expect(events).toEqual(['x', 'y'])
  })

  it('пробрасывает [DONE] как событие', () => {
    const { events } = parseSSEBuffer('data: [DONE]\n\n')
    expect(events).toEqual(['[DONE]'])
  })

  it('игнорирует строки без префикса data:', () => {
    const { events } = parseSSEBuffer('event: message\ndata: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/gigachat/sse.test.ts`
Expected: FAIL — `parseSSEBuffer` не определён.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/gigachat/sse.ts
// Парсит накопленный SSE-буфер. Возвращает завершённые data-payload'ы
// (события разделены '\n\n') и незавершённый хвост для следующего чтения.
export function parseSSEBuffer(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  let rest = buffer
  let idx = rest.indexOf('\n\n')
  while (idx !== -1) {
    const raw = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
    if (dataLines.length > 0) events.push(dataLines.join('\n'))
    idx = rest.indexOf('\n\n')
  }
  return { events, rest }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/gigachat/sse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/gigachat/sse.ts tests/lib/gigachat/sse.test.ts
git commit -m "feat(gigachat): add SSE buffer parser for streaming"
```

---

### Task 2: `chatCompletionStream` — стриминговый вызов GigaChat (TDD)

Async-генератор, который шлёт `stream: true`, читает `res.body` через reader + `TextDecoder`, парсит SSE и yield'ит дельты `choices[0].delta.content`. Останавливается на `[DONE]`. Для тестов `fetch` стабается (как в существующем `tests/lib/gigachat/client.test.ts`), `body` — `ReadableStream` из строковых кусков.

**Files:**
- Modify: `lib/gigachat/client.ts` (добавить функцию; существующий `chatCompletion` НЕ трогать)
- Test: `tests/lib/gigachat/stream.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/gigachat/stream.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatCompletionStream } from '@/lib/gigachat/client'
import { __resetTokenCacheForTests } from '@/lib/gigachat/token'

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
}

function stubStream(chunks: string[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/oauth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', expires_at: Date.now() + 30 * 60 * 1000 }),
      }
    }
    return { ok: true, status: 200, body: streamFromChunks(chunks) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chatCompletionStream', () => {
  beforeEach(() => {
    __resetTokenCacheForTests()
    process.env.GIGACHAT_AUTH_KEY = 'dGVzdA=='
    process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('собирает дельты контента и завершается на [DONE]', async () => {
    stubStream([
      'data: {"choices":[{"delta":{"content":"Привет"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", мир"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    let out = ''
    for await (const piece of chatCompletionStream([{ role: 'user', content: 'hi' }])) {
      out += piece
    }
    expect(out).toBe('Привет, мир')
  })

  it('склеивает дельты, разорванные между чанками', async () => {
    stubStream([
      'data: {"choices":[{"delta":{"content":"А"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":"Б"}}]}\n\ndata: [DONE]\n\n',
    ])
    let out = ''
    for await (const piece of chatCompletionStream([{ role: 'user', content: 'hi' }])) {
      out += piece
    }
    expect(out).toBe('АБ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/gigachat/stream.test.ts`
Expected: FAIL — `chatCompletionStream` не экспортирован.

- [ ] **Step 3: Write minimal implementation**

Добавить в конец `lib/gigachat/client.ts` (импорт `parseSSEBuffer` сверху файла):

```ts
import { parseSSEBuffer } from './sse'
```

```ts
export async function* chatCompletionStream(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  const cfg = getGigaConfig()
  ensureInsecureTls(cfg.insecureTls)
  const token = await getAccessToken()

  const res = await fetch(`${cfg.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2400,
      stream: true,
    }),
  })

  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`GigaChat stream failed: ${res.status} ${text}`)
  }
  if (!res.body) throw new Error('GigaChat stream: пустое тело ответа')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSSEBuffer(buffer)
    buffer = rest
    for (const ev of events) {
      if (ev === '[DONE]') return
      try {
        const j = JSON.parse(ev) as { choices?: Array<{ delta?: { content?: string } }> }
        const piece = j.choices?.[0]?.delta?.content
        if (piece) yield piece
      } catch {
        // keep-alive / служебная строка — пропускаем
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/gigachat/stream.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/gigachat/client.ts lib/gigachat/sse.ts tests/lib/gigachat/stream.test.ts
git commit -m "feat(gigachat): add streaming chat completion"
```

---

### Task 3: partial-JSON completer (чистая логика, TDD)

Для прогрессивного рендера нужно парсить обрезанный JSON-префикс. Без внешней зависимости: дополняем открытые строки/массивы/объекты до валидного JSON. (Заменяет потребность в npm `partial-json` — экономия RAM/зависимостей.)

**Files:**
- Create: `lib/scenario/partial.ts`
- Test: `tests/lib/scenario/partial.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/scenario/partial.test.ts
import { describe, expect, it } from 'vitest'
import { parsePartialJson } from '@/lib/scenario/partial'

describe('parsePartialJson', () => {
  it('парсит полный объект', () => {
    expect(parsePartialJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('закрывает оборванную строку', () => {
    expect(parsePartialJson('{"title":"Дру')).toEqual({ title: 'Дру' })
  })

  it('закрывает оборванный массив и объект', () => {
    expect(parsePartialJson('{"goals":["a","b"')).toEqual({ goals: ['a', 'b'] })
  })

  it('закрывает вложенные этапы', () => {
    expect(
      parsePartialJson('{"stages":[{"title":"X","duration_min":5},{"title":"Y"'),
    ).toEqual({ stages: [{ title: 'X', duration_min: 5 }, { title: 'Y' }] })
  })

  it('срезает висячую запятую', () => {
    expect(parsePartialJson('{"a":1,')).toEqual({ a: 1 })
  })

  it('подставляет null после висячего двоеточия', () => {
    expect(parsePartialJson('{"a":')).toEqual({ a: null })
  })

  it('снимает markdown-обёртку', () => {
    expect(parsePartialJson('```json\n{"a":1}')).toEqual({ a: 1 })
  })

  it('возвращает null если нет объекта', () => {
    expect(parsePartialJson('просто текст')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/scenario/partial.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/scenario/partial.ts

function stripToObject(raw: string): string | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*)/i)
  if (fence) s = fence[1]
  const start = s.indexOf('{')
  if (start === -1) return null
  return s.slice(start)
}

function closeOpenTokens(s: string): string {
  const stack: Array<'{' | '['> = []
  let inString = false
  let escaped = false
  for (const c of s) {
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }
  let out = s
  if (inString) out += '"'
  out = out.replace(/\s+$/, '')
  if (out.endsWith(',')) out = out.slice(0, -1)
  if (out.endsWith(':')) out += 'null'
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']'
  }
  return out
}

// Парсит возможно-обрезанный JSON-префикс объекта, дополняя открытые
// строки/массивы/объекты. Возвращает значение или null.
export function parsePartialJson(raw: string): unknown | null {
  const s = stripToObject(raw)
  if (s === null) return null
  try {
    return JSON.parse(s)
  } catch {
    try {
      return JSON.parse(closeOpenTokens(s))
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/scenario/partial.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/scenario/partial.ts tests/lib/scenario/partial.test.ts
git commit -m "feat(scenario): add partial-json completer for streaming"
```

---

### Task 4: skeleton-схема + промпт-билдеры для двухэтапной генерации (TDD)

Этап 1 (skeleton): только `title`, `goals`, `stages[].{kind,title,duration_min}`. Этап 2 (details): по готовому skeleton заполняет `materials`, `activities`, `adaptations`, сохраняя названия/хронометраж.

**Files:**
- Modify: `lib/scenario/schema.ts` (добавить `skeletonSchema`/`ScenarioSkeleton`)
- Modify: `lib/scenario/prompt.ts` (добавить два билдера, bump `PROMPT_VERSION`)
- Test: `tests/lib/scenario/prompt-stream.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/scenario/prompt-stream.test.ts
import { describe, expect, it } from 'vitest'
import { buildDetailsMessages, buildSkeletonMessages } from '@/lib/scenario/prompt'
import { skeletonSchema } from '@/lib/scenario/schema'

const input = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 30,
  format: 'Беседа' as const,
}

describe('buildSkeletonMessages', () => {
  it('просит только каркас без activities', () => {
    const msgs = buildSkeletonMessages(input, [], [])
    const sys = msgs[0].content
    expect(msgs).toHaveLength(2)
    expect(sys).toContain('duration_min')
    expect(sys).not.toContain('activities')
    expect(msgs[1].content).toContain('Дружба')
  })
})

describe('buildDetailsMessages', () => {
  it('включает skeleton и требует activities/adaptations', () => {
    const skeleton = {
      title: 'Дружба',
      goals: ['цель'],
      stages: [{ kind: 'engage' as const, title: 'Старт', duration_min: 10 }],
    }
    const msgs = buildDetailsMessages(input, skeleton, [])
    const joined = msgs.map((m) => m.content).join('\n')
    expect(joined).toContain('Старт')
    expect(joined).toContain('activities')
    expect(joined).toContain('adaptations')
  })
})

describe('skeletonSchema', () => {
  it('валидирует корректный каркас', () => {
    const r = skeletonSchema.safeParse({
      title: 'T',
      goals: ['g'],
      stages: [{ kind: 'engage', title: 'S', duration_min: 5 }],
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-stream.test.ts`
Expected: FAIL — функции/схема не определены.

- [ ] **Step 3a: Добавить skeletonSchema в `lib/scenario/schema.ts`**

После `scenarioContentSchema` (рядом, до экспортов типов) добавить:

```ts
export const skeletonStageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.coerce.number().int().min(0),
})

export const skeletonSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  stages: z.array(skeletonStageSchema).min(1),
})

export type ScenarioSkeleton = z.infer<typeof skeletonSchema>
```

- [ ] **Step 3b: Добавить билдеры в `lib/scenario/prompt.ts`**

Заменить строку `export const PROMPT_VERSION = 'v1-rag-2026-05-20'` на:

```ts
export const PROMPT_VERSION = 'v2-stream-2026-05-20'
```

Импортировать тип skeleton сверху:

```ts
import type { GenerationInput, ScenarioSkeleton } from './schema'
```

(Существующий импорт `import type { GenerationInput } from './schema'` заменить этой строкой.)

Добавить в конец файла:

```ts
const SKELETON_SCHEMA_HINT = `Структура JSON каркаса (СТРОГО только эти ключи, без activities/materials/adaptations):
{
  "title": string,
  "goals": string[],            // 1-4 воспитательных результата
  "stages": [                   // минимум 3 этапа: вовлечение, основная часть, рефлексия
    { "kind": "engage" | "main" | "reflection", "title": string, "duration_min": number }
  ]
}`

export function buildSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Сначала ты строишь только КАРКАС сценария: название, цели и список этапов с длительностью.',
    'Отвечаешь строго JSON, без markdown и пояснений. Без реальных имён детей.',
    '',
    SKELETON_SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект каркаса. Сумма duration_min ≈ длительности занятия.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (ориентир по структуре, не копируй дословно):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []
  const examples =
    sharedExamples.length > 0
      ? [
          '',
          '[GOOD_EXAMPLES] (удачные сценарии коллег — ориентир по структуре):',
          ...sharedExamples.map((e, i) => `(${i + 1}) ${e.title}: ${e.summary}`),
        ]
      : []

  const user = [
    'Построй каркас сценария внеурочного занятия:',
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

export function buildDetailsMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  ragChunks: RagChunkForPrompt[] = [],
): ChatMessage[] {
  const system = [
    'Ты — методист внеурочной деятельности в школе РФ.',
    'Тебе дан готовый каркас сценария. Заполни его деталями, СОХРАНИВ названия этапов,',
    'их порядок и длительность (duration_min). Добавь materials, activities (с конкретными',
    'вопросами, не общими) и adaptations. Активная роль детей, обязательная рефлексия.',
    'Отвечаешь строго JSON по полной схеме, без markdown. Без реальных имён детей.',
    '',
    SCHEMA_HINT,
    '',
    'Верни ТОЛЬКО валидный JSON-объект по полной схеме.',
  ].join('\n')

  const methodology =
    ragChunks.length > 0
      ? [
          '',
          '[RELEVANT_METHODOLOGY] (опирайся, но не копируй):',
          ...ragChunks.map((c, i) => `(${i + 1}) [${c.documentTitle}] ${c.text}`),
        ]
      : []

  const user = [
    'Заполни деталями этот каркас сценария:',
    JSON.stringify(skeleton),
    '',
    `Параметры: направление ${input.direction}, ${input.grade} класс, тема «${input.topic}», ${input.durationMin} минут, формат ${input.format}.`,
    ...methodology,
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-stream.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/scenario/schema.ts lib/scenario/prompt.ts tests/lib/scenario/prompt-stream.test.ts
git commit -m "feat(scenario): add skeleton schema and two-stage prompt builders"
```

---

### Task 5: оркестратор `streamScenario` (async-генератор событий, TDD)

Сердце фичи. Делает RAG retrieve + prematch (как `generateScenario`), стримит skeleton → details, прогрессивно yield'ит события, валидирует/нормализует, вызывает инъектированный `save`. Чистая логика с инъекцией зависимостей — без живой сети и без БД в тестах.

**Files:**
- Create: `lib/scenario/stream.ts`
- Test: `tests/lib/scenario/stream.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/scenario/stream.test.ts
import { describe, expect, it, vi } from 'vitest'
import { streamScenario } from '@/lib/scenario/stream'
import type { ScenarioContent } from '@/lib/scenario/schema'

const input = {
  direction: 'Патриотическое' as const,
  grade: 5,
  topic: 'Дружба',
  durationMin: 20,
  format: 'Беседа' as const,
}

const SKELETON = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  stages: [
    { kind: 'engage', title: 'Старт', duration_min: 5 },
    { kind: 'main', title: 'Основа', duration_min: 10 },
    { kind: 'reflection', title: 'Итог', duration_min: 5 },
  ],
}

const FULL: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  materials: ['Доска'],
  stages: [
    { kind: 'engage', title: 'Старт', duration_min: 5, activities: [{ type: 'discussion', text: 'Что такое дружба?' }] },
    { kind: 'main', title: 'Основа', duration_min: 10, activities: [{ type: 'game', text: 'Игра' }] },
    { kind: 'reflection', title: 'Итог', duration_min: 5, activities: [{ type: 'task', text: 'Итог' }] },
  ],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
}

function chunked(s: string, n = 20): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out
}

function makeChatStream() {
  const calls: string[] = []
  return async function* chatStream(messages: { role: string; content: string }[]) {
    // первый вызов = skeleton, второй = details (по наличию каркаса в user-сообщении)
    const isDetails = messages.some((m) => m.content.includes('Заполни деталями'))
    calls.push(isDetails ? 'details' : 'skeleton')
    const payload = JSON.stringify(isDetails ? FULL : SKELETON)
    for (const piece of chunked(payload)) yield piece
  }
}

describe('streamScenario', () => {
  it('эмитит фазы, skeleton, stage, saving и done', async () => {
    const save = vi.fn(async () => 'scenario-123')
    const events: any[] = []
    for await (const ev of streamScenario(input, {
      chatStream: makeChatStream(),
      retrieve: async () => [],
      prematch: (async () => []) as any,
      save,
    })) {
      events.push(ev)
    }

    const types = events.map((e) => e.type)
    expect(types).toContain('skeleton')
    expect(types).toContain('stage')
    expect(types.filter((t) => t === 'phase')).not.toHaveLength(0)
    const done = events.find((e) => e.type === 'done')
    expect(done).toEqual({ type: 'done', scenarioId: 'scenario-123' })

    expect(save).toHaveBeenCalledTimes(1)
    const [savedContent] = save.mock.calls[0]
    expect(savedContent.stages).toHaveLength(3)
    // нормализация хронометража: сумма == длительности
    const total = savedContent.stages.reduce((s: number, st: any) => s + st.duration_min, 0)
    expect(total).toBe(20)
  })

  it('эмитит error при невалидном результате после repair', async () => {
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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/scenario/stream.test.ts`
Expected: FAIL — `streamScenario` не определён.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/scenario/stream.ts
import { prematchShared } from '@/lib/community/prematch'
import { chatCompletion, chatCompletionStream } from '@/lib/gigachat/client'
import { getGigaConfig } from '@/lib/gigachat/config'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { normalizeChronometry } from './normalize'
import { parsePartialJson } from './partial'
import {
  PROMPT_VERSION,
  type RagChunkForPrompt,
  type SharedExampleForPrompt,
  buildDetailsMessages,
  buildSkeletonMessages,
} from './prompt'
import {
  type GenerationInput,
  type GenerationMeta,
  type ScenarioContent,
  type ScenarioSkeleton,
  scenarioContentSchema,
  skeletonSchema,
} from './schema'

export type StreamEvent =
  | { type: 'phase'; phase: 'skeleton' | 'details' | 'validating' | 'saving' }
  | { type: 'skeleton'; data: unknown }
  | { type: 'stage'; index: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }

type ChatStreamFn = (
  messages: GigaMessage[],
  opts?: { temperature?: number },
) => AsyncGenerator<string, void, unknown>

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

type RetrieveFn = (q: {
  direction: string | null
  grade: number
  topic: string
}) => Promise<Array<{ id: string; chunkText: string; documentTitle: string; sectionKind: string }>>

export type StreamDeps = {
  chatStream?: ChatStreamFn
  chat?: ChatFn
  retrieve?: RetrieveFn
  prematch?: typeof prematchShared
  save: (content: ScenarioContent, meta: GenerationMeta) => Promise<string>
}

async function collectStream(
  gen: AsyncGenerator<string, void, unknown>,
  onPartial: (buf: string) => void,
): Promise<string> {
  let buf = ''
  for await (const piece of gen) {
    buf += piece
    onPartial(buf)
  }
  return buf
}

function parseContent(raw: string): ScenarioContent | null {
  const obj = parsePartialJson(raw)
  if (obj === null) return null
  const parsed = scenarioContentSchema.safeParse(obj)
  return parsed.success ? parsed.data : null
}

export async function* streamScenario(
  input: GenerationInput,
  deps: StreamDeps,
): AsyncGenerator<StreamEvent, void, unknown> {
  const chatStream = deps.chatStream ?? chatCompletionStream
  const chat = deps.chat ?? chatCompletion
  const retrieve = deps.retrieve ?? ((q) => retrieveChunks(q))
  const prematch = deps.prematch ?? prematchShared
  const model = (() => {
    try {
      return getGigaConfig().model
    } catch {
      return process.env.GIGACHAT_MODEL ?? 'GigaChat'
    }
  })()
  const started = Date.now()

  try {
    // --- RAG + prematch (best-effort) ---
    let ragChunks: RagChunkForPrompt[] = []
    let usedChunkIds: string[] = []
    try {
      const found = await retrieve({
        direction: input.direction,
        grade: input.grade,
        topic: input.topic,
      })
      ragChunks = found.map((c) => ({
        text: c.chunkText,
        documentTitle: c.documentTitle,
        sectionKind: c.sectionKind,
      }))
      usedChunkIds = found.map((c) => c.id)
    } catch (e) {
      console.error('RAG retrieval failed (non-fatal):', e)
    }

    let sharedExamples: SharedExampleForPrompt[] = []
    try {
      const matches = await prematch(
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

    // --- STAGE 1: skeleton ---
    yield { type: 'phase', phase: 'skeleton' }
    const skMessages = buildSkeletonMessages(input, ragChunks, sharedExamples)
    let lastSkeletonEmit = ''
    const skRaw = await collectStream(chatStream(skMessages, { temperature: 0.4 }), () => {})
    const skObj = parsePartialJson(skRaw)
    if (skObj && JSON.stringify(skObj) !== lastSkeletonEmit) {
      lastSkeletonEmit = JSON.stringify(skObj)
      yield { type: 'skeleton', data: skObj }
    }
    let skeleton = skeletonSchema.safeParse(skObj).data as ScenarioSkeleton | undefined
    if (!skeleton) {
      // repair skeleton одним нестриминговым вызовом
      const rep = await chat(
        [...skMessages, { role: 'user', content: 'Верни ТОЛЬКО валидный JSON каркаса по схеме.' }],
        { temperature: 0.2 },
      )
      skeleton = skeletonSchema.safeParse(parsePartialJson(rep.content)).data as
        | ScenarioSkeleton
        | undefined
    }
    if (!skeleton) throw new Error('Невалидный каркас сценария')

    // --- STAGE 2: details ---
    yield { type: 'phase', phase: 'details' }
    const dtMessages = buildDetailsMessages(input, skeleton, ragChunks)
    let emittedStages = 0
    const dtRaw = await collectStream(chatStream(dtMessages, { temperature: 0.4 }), (buf) => {
      const partial = parsePartialJson(buf) as { stages?: unknown[] } | null
      const ready = Array.isArray(partial?.stages) ? partial.stages.length : 0
      // прогресс по этапам отложим до синхронного yield ниже (генератор не может
      // yield внутри callback) — здесь только считаем; см. цикл после сбора
      void ready
    })

    yield { type: 'phase', phase: 'validating' }
    let content = parseContent(dtRaw)
    let repaired = false
    if (!content) {
      repaired = true
      const rep = await chat(
        [
          ...dtMessages,
          { role: 'assistant', content: dtRaw },
          { role: 'user', content: 'Ответ невалиден. Верни ТОЛЬКО валидный JSON по полной схеме.' },
        ],
        { temperature: 0.2 },
      )
      content = parseContent(rep.content)
    }
    if (!content) throw new Error('GigaChat вернул невалидный сценарий после repair')

    // эмитим прогресс по этапам (синхронно, после валидации)
    for (let i = emittedStages; i < content.stages.length; i++) {
      yield { type: 'stage', index: i }
    }
    emittedStages = content.stages.length

    const { content: normalized, changed } = normalizeChronometry(content, input.durationMin)

    const meta: GenerationMeta = {
      model,
      promptVersion: PROMPT_VERSION,
      repaired,
      normalized: changed,
      usage: null,
      latencyMs: Date.now() - started,
      usedChunkIds,
    }

    yield { type: 'phase', phase: 'saving' }
    const scenarioId = await deps.save(normalized, meta)
    yield { type: 'done', scenarioId }
  } catch (e) {
    console.error('streamScenario failed:', e)
    yield { type: 'error', message: 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.' }
  }
}
```

> **Замечание для исполнителя:** async-генератор НЕ может `yield` из callback'а `onPartial`. Прогресс по этапам (`stage`-события) эмитим синхронно после сбора details-стрима — это покрывает тест (он проверяет наличие `stage`-события, не реалтайм). Реалтайм-`skeleton` событие даём сразу после сбора skeleton-стрима. Если позже захочется реалтайм-прогресс по этапам — выносится в отдельную задачу.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/scenario/stream.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/scenario/stream.ts tests/lib/scenario/stream.test.ts
git commit -m "feat(scenario): add streamScenario orchestrator"
```

---

### Task 6: SSE route-handler `/api/generate/stream`

Тонкий адаптер: auth → rate-limit (заглушка до Task 11; пока без лимита) → собирает `save`-замыкание (insert scenarios + versions + generations + embedding, как в старом action) → прогоняет `streamScenario` в `ReadableStream`, кодирует события в `data: ...\n\n`.

> **Порядок:** rate-limit-обёртка добавляется в Task 11 (после готовности `lib/ratelimit`). В этой задаче — рабочий стрим без лимита.

**Files:**
- Create: `app/api/generate/stream/route.ts`

- [ ] **Step 1: Реализация route-handler**

```ts
// app/api/generate/stream/route.ts
import { auth } from '@/auth'
import { db } from '@/db'
import { generations, planTopics, scenarioVersions, scenarios } from '@/db/schema'
import { streamScenario } from '@/lib/scenario/stream'
import { generationInputSchema } from '@/lib/scenario/schema'
import type { GenerationMeta, ScenarioContent } from '@/lib/scenario/schema'
import { and, eq, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const parsed = generationInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Проверьте параметры формы' }, { status: 400 })
  }
  const input = parsed.data

  // resolve sourcePlanTopicId (с изоляцией по user_id)
  let sourcePlanTopicId: string | null = null
  const rawTopicId = (body as { planTopicId?: unknown })?.planTopicId
  if (typeof rawTopicId === 'string' && rawTopicId.length > 0) {
    const [t] = await db
      .select({ id: planTopics.id })
      .from(planTopics)
      .where(and(eq(planTopics.id, rawTopicId), eq(planTopics.userId, userId)))
      .limit(1)
    if (t) sourcePlanTopicId = t.id
  }

  const save = async (content: ScenarioContent, meta: GenerationMeta): Promise<string> => {
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
        sourcePlanTopicId,
        content,
        inputContext: input,
        generationMeta: meta,
      })
      .returning({ id: scenarios.id })
    const scenarioId = row.id
    await db.insert(scenarioVersions).values({ scenarioId, content })
    await db.insert(generations).values({
      userId,
      scenarioId,
      promptTokens: meta.usage?.promptTokens ?? null,
      completionTokens: meta.usage?.completionTokens ?? null,
      latencyMs: meta.latencyMs,
      status: 'ok',
    })
    try {
      const { embed } = await import('@/lib/gigachat/embeddings')
      const [vec] = await embed([`${input.direction} ${input.topic} ${content.title}`])
      await db.execute(
        sql`UPDATE scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${scenarioId}`,
      )
    } catch (e) {
      console.error('scenario embedding failed (non-fatal):', e)
    }
    return scenarioId
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let sawError = false
      try {
        for await (const ev of streamScenario(input, { save })) {
          if (ev.type === 'error') sawError = true
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        }
      } catch (e) {
        console.error('generate stream crashed:', e)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Ошибка генерации.' })}\n\n`,
          ),
        )
        sawError = true
      } finally {
        if (sawError) {
          await db
            .insert(generations)
            .values({ userId, scenarioId: null, latencyMs: null, status: 'error' })
            .catch(() => {})
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

- [ ] **Step 2: Verify gates (роут компилируется, типы сходятся)**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: build OK, нет ошибок типов в route.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/stream/route.ts
git commit -m "feat(api): add SSE generation stream route"
```

---

### Task 7: Клиентский прогрессивный UI + переключение `/app/new` на стрим

Заменяем путь генерации: вместо server-action redirect — `fetch('/api/generate/stream')`, чтение reader'а, прогрессивный рендер каркаса с пульсацией и прогресс-баром фаз. На `done` → `router.push`. На ошибку/обрыв → сообщение + fallback. Prematch-флоу сохраняется. Удаляем осиротевший `generateScenarioAction`.

**Files:**
- Create: `components/generation/GenerationStream.tsx`
- Modify: `app/app/new/page.tsx`
- Modify: `app/app/new/actions.ts` (удалить `generateScenarioAction` и неиспользуемые импорты)

- [ ] **Step 1: Создать компонент `GenerationStream.tsx`**

```tsx
// components/generation/GenerationStream.tsx
'use client'

import { parseSSEBuffer } from '@/lib/gigachat/sse'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'skeleton' | 'details' | 'validating' | 'saving'

type StreamEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'skeleton'; data: { title?: string; stages?: Array<{ title?: string }> } }
  | { type: 'stage'; index: number }
  | { type: 'done'; scenarioId: string }
  | { type: 'error'; message: string }

const PHASE_LABEL: Record<Phase, string> = {
  skeleton: 'Структура',
  details: 'Детализация этапов',
  validating: 'Проверка',
  saving: 'Сохранение',
}
const PHASE_ORDER: Phase[] = ['skeleton', 'details', 'validating', 'saving']

export function GenerationStream({ payload }: { payload: Record<string, unknown> }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('skeleton')
  const [title, setTitle] = useState<string | null>(null)
  const [stageTitles, setStageTitles] = useState<string[]>([])
  const [filled, setFilled] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const ac = new AbortController()

    ;(async () => {
      try {
        const res = await fetch('/api/generate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ac.signal,
        })
        if (res.status === 429) {
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? 'Превышен дневной лимит генераций.')
          return
        }
        if (!res.ok || !res.body) {
          setError('Не удалось запустить генерацию.')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSSEBuffer(buffer)
          buffer = rest
          for (const raw of events) {
            let ev: StreamEvent
            try {
              ev = JSON.parse(raw) as StreamEvent
            } catch {
              continue
            }
            if (ev.type === 'phase') setPhase(ev.phase)
            else if (ev.type === 'skeleton') {
              if (ev.data.title) setTitle(ev.data.title)
              if (Array.isArray(ev.data.stages)) {
                setStageTitles(ev.data.stages.map((s) => s.title ?? 'Этап'))
              }
            } else if (ev.type === 'stage') setFilled((n) => Math.max(n, ev.index + 1))
            else if (ev.type === 'done') router.push(`/app/scenarios/${ev.scenarioId}`)
            else if (ev.type === 'error') setError(ev.message)
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) setError('Соединение прервано. Попробуйте ещё раз.')
      }
    })()

    return () => ac.abort()
  }, [payload, router])

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-error">{error}</p>
          <Button type="button" onClick={() => window.location.reload()}>
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    )
  }

  const phaseIdx = PHASE_ORDER.indexOf(phase)
  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle>{title ?? 'Генерируем сценарий…'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PHASE_ORDER.map((p, i) => (
            <span
              key={p}
              className={`rounded-full px-3 py-1 text-xs ring-1 ${
                i <= phaseIdx
                  ? 'bg-brand-50 text-brand-700 ring-brand-200'
                  : 'bg-neutral-50 text-neutral-400 ring-neutral-200'
              }`}
            >
              {PHASE_LABEL[p]}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {(stageTitles.length > 0 ? stageTitles : ['', '', '']).map((st, i) => (
            <div
              key={i}
              className={`rounded-md p-3 ring-1 ring-neutral-200 ${
                i < filled ? 'bg-neutral-0' : 'animate-pulse bg-neutral-50'
              }`}
            >
              <p className="text-sm font-medium text-neutral-800">{st || ' '}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

(Импорты `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle` добавить сверху — см. их пути в существующем `page.tsx`: `@/components/ui/button`, `@/components/ui/card`.)

- [ ] **Step 2: Переключить `app/app/new/page.tsx` на стрим**

Изменения в `page.tsx`:
1. Импорты: убрать `generateScenarioAction` и `NewScenarioState` из `'./actions'`; убрать `useActionState`; добавить `import { GenerationStream } from '@/components/generation/GenerationStream'`.
2. Заменить состояние формы: вместо `useActionState` ввести
   ```tsx
   const [generating, setGenerating] = useState<Record<string, unknown> | null>(null)
   const [formError, setFormError] = useState<string | null>(null)
   ```
3. Форма больше не использует `action={formAction}`. Submit перехватываем: `<form ref={formRef} onSubmit={onGenerate} className="space-y-4">`.
4. Функция запуска генерации (валидирует поля и переводит в режим стрима):
   ```tsx
   function onGenerate(e?: React.FormEvent) {
     e?.preventDefault()
     if (!formRef.current) return
     const fd = new FormData(formRef.current)
     const payload = {
       direction: fd.get('direction'),
       grade: fd.get('grade'),
       topic: fd.get('topic'),
       durationMin: fd.get('durationMin'),
       format: fd.get('format'),
       planTopicId: fd.get('planTopicId') || undefined,
     }
     if (!payload.topic || String(payload.topic).trim().length === 0) {
       setFormError('Укажите тему')
       return
     }
     setFormError(null)
     setGenerating(payload)
   }
   ```
5. `onPrematch` остаётся; в ветке «нет совпадений» вместо `formRef.current?.requestSubmit()` вызывать `onGenerate()`. Кнопки «Сгенерировать новый» в блоке matches вызывают `onGenerate()`.
6. Если `generating` не null — рендерить `<GenerationStream payload={generating} />` вместо/над формой (форму можно скрыть). Пример: в начале return после `<h1>`:
   ```tsx
   {generating ? (
     <GenerationStream payload={generating} />
   ) : (
     <> {/* существующая Card с формой + блок matches */} </>
   )}
   ```
7. Заменить `{state?.error && ...}` на `{formError && <p className="text-sm text-error">{formError}</p>}`.
8. Кнопка submit: убрать ветку `pending`, оставить «Подобрать похожие» (prematch) как основную; добавить, что при отсутствии совпадений запускается генерация (уже в onPrematch).

> Точные правки — по месту; ключевое: путь генерации идёт через `GenerationStream`, а не через `generateScenarioAction`.

- [ ] **Step 3: Удалить осиротевший `generateScenarioAction`**

В `app/app/new/actions.ts`:
- Удалить функцию `generateScenarioAction` целиком и тип `NewScenarioState`.
- Удалить ставшие неиспользуемыми импорты: `db`, `generations`, `planTopics`, `scenarioVersions`, `scenarios`, `generateScenario`, `and`, `eq`, `sql`, `redirect`. Оставить то, что нужно `prematchAction`: `auth`, `prematchShared`, `generationInputSchema`.
- `prematchAction` и тип `PrematchCard` остаются без изменений.

- [ ] **Step 4: Verify gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: компиляция OK; нет неиспользуемых импортов (biome это ловит).

- [ ] **Step 5: Commit**

```bash
git add components/generation/GenerationStream.tsx app/app/new/page.tsx app/app/new/actions.ts
git commit -m "feat(new): stream scenario generation in UI, drop single-shot action"
```

---

# PART B — Rate-limit подсистема

### Task 8: Таблица `rate_buckets` + миграция

Generic-ключ: `subject` (userId ИЛИ ip — для login лимит по IP в pre-auth). Это осознанное отклонение от `user_id fk` в §4 спеки: чтобы покрыть login по IP (§9), используем текстовый `subject`. PK = (key, subject, window_start).

**Files:**
- Modify: `db/schema.ts`
- Create: миграция через `pnpm db:generate`

- [ ] **Step 1: Добавить таблицу в `db/schema.ts`**

Убедиться, что `primaryKey` импортирован из `drizzle-orm/pg-core` (добавить в существующий импорт, если нет). Добавить в конец файла:

```ts
export const rateBuckets = pgTable(
  'rate_buckets',
  {
    key: text('key').notNull(),
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.subject, t.windowStart] }),
  }),
)
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: создан новый файл `db/migrations/0007_*.sql` с `CREATE TABLE "rate_buckets"`.

- [ ] **Step 3: Применить миграцию (нужен поднятый Postgres)**

Run: `pnpm db:up && pnpm db:migrate`
Expected: `Done.` без ошибок.

- [ ] **Step 4: Verify gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add db/schema.ts db/migrations
git commit -m "feat(db): add rate_buckets table"
```

---

### Task 9: Чистые хелперы rate-limit (TDD)

**Files:**
- Create: `lib/ratelimit/window.ts`
- Test: `tests/lib/ratelimit/window.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/ratelimit/window.test.ts
import { describe, expect, it } from 'vitest'
import { isWhitelisted, windowStartFor } from '@/lib/ratelimit/window'

describe('windowStartFor', () => {
  it('округляет вниз до начала окна', () => {
    const now = new Date('2026-05-20T13:37:42.000Z')
    const ws = windowStartFor(now, 15 * 60 * 1000)
    expect(ws.toISOString()).toBe('2026-05-20T13:30:00.000Z')
  })
  it('суточное окно начинается в полночь UTC', () => {
    const now = new Date('2026-05-20T13:37:42.000Z')
    const ws = windowStartFor(now, 86_400_000)
    expect(ws.toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })
})

describe('isWhitelisted', () => {
  it('матчит без учёта регистра и пробелов', () => {
    expect(isWhitelisted('Demo@x.ru', ' demo@x.ru , a@b.ru ')).toBe(true)
  })
  it('false для пустого email или пустого списка', () => {
    expect(isWhitelisted(null, 'a@b.ru')).toBe(false)
    expect(isWhitelisted('a@b.ru', '')).toBe(false)
    expect(isWhitelisted('a@b.ru', undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/ratelimit/window.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/ratelimit/window.ts
export function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

export function isWhitelisted(
  email: string | null | undefined,
  demoEmails: string | undefined,
): boolean {
  if (!email) return false
  const set = (demoEmails ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return set.includes(email.toLowerCase())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/ratelimit/window.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/ratelimit/window.ts tests/lib/ratelimit/window.test.ts
git commit -m "feat(ratelimit): add window and whitelist helpers"
```

---

### Task 10: `checkRateLimit` + store (TDD с in-memory store)

`checkRateLimit` — чистая логика поверх инъектируемого `RateStore`. Whitelist байпасит. Lazy cleanup (DELETE старше 24ч для subject) при каждом вызове. `dbStore` — реальная реализация на drizzle (upsert через `onConflictDoUpdate`).

**Files:**
- Create: `lib/ratelimit/index.ts`
- Create: `lib/ratelimit/store.ts`
- Test: `tests/lib/ratelimit/check.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/ratelimit/check.test.ts
import { describe, expect, it } from 'vitest'
import { checkRateLimit } from '@/lib/ratelimit'
import type { RateStore } from '@/lib/ratelimit'

function memStore(): RateStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>()
  const k = (key: string, subject: string, ws: Date) => `${key}|${subject}|${ws.toISOString()}`
  return {
    rows,
    async cleanup() {},
    async current(key, subject, ws) {
      return rows.get(k(key, subject, ws)) ?? 0
    },
    async increment(key, subject, ws) {
      rows.set(k(key, subject, ws), (rows.get(k(key, subject, ws)) ?? 0) + 1)
    },
  }
}

const now = new Date('2026-05-20T10:00:00.000Z')

describe('checkRateLimit', () => {
  it('пропускает под лимитом и инкрементит', async () => {
    const store = memStore()
    const r = await checkRateLimit(
      { key: 'gen', subject: 'u1', limit: 2, windowMs: 86_400_000 },
      { store, now },
    )
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(1)
    expect(store.rows.size).toBe(1)
  })

  it('блокирует на лимите и считает retryAfter', async () => {
    const store = memStore()
    const c = { key: 'gen', subject: 'u1', limit: 1, windowMs: 86_400_000 }
    await checkRateLimit(c, { store, now })
    const r = await checkRateLimit(c, { store, now })
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it('whitelist байпасит лимит без инкремента', async () => {
    const store = memStore()
    const r = await checkRateLimit(
      { key: 'gen', subject: 'u1', limit: 0, windowMs: 86_400_000, email: 'demo@x.ru' },
      { store, now, demoEmails: 'demo@x.ru' },
    )
    expect(r.allowed).toBe(true)
    expect(store.rows.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/ratelimit/check.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3a: `lib/ratelimit/store.ts` (drizzle dbStore)**

```ts
// lib/ratelimit/store.ts
import { db } from '@/db'
import { rateBuckets } from '@/db/schema'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { RateStore } from './index'

export const dbStore: RateStore = {
  async cleanup(subject, olderThan) {
    await db
      .delete(rateBuckets)
      .where(and(eq(rateBuckets.subject, subject), lt(rateBuckets.windowStart, olderThan)))
  },
  async current(key, subject, windowStart) {
    const [row] = await db
      .select({ count: rateBuckets.count })
      .from(rateBuckets)
      .where(
        and(
          eq(rateBuckets.key, key),
          eq(rateBuckets.subject, subject),
          eq(rateBuckets.windowStart, windowStart),
        ),
      )
      .limit(1)
    return row?.count ?? 0
  },
  async increment(key, subject, windowStart) {
    await db
      .insert(rateBuckets)
      .values({ key, subject, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateBuckets.key, rateBuckets.subject, rateBuckets.windowStart],
        set: { count: sql`${rateBuckets.count} + 1` },
      })
  },
}
```

- [ ] **Step 3b: `lib/ratelimit/index.ts`**

```ts
// lib/ratelimit/index.ts
import { isWhitelisted, windowStartFor } from './window'

export type RateStore = {
  cleanup: (subject: string, olderThan: Date) => Promise<void>
  current: (key: string, subject: string, windowStart: Date) => Promise<number>
  increment: (key: string, subject: string, windowStart: Date) => Promise<void>
}

export type RateCheck = {
  key: string
  subject: string
  limit: number
  windowMs: number
  email?: string | null
}

export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number }

export async function checkRateLimit(
  check: RateCheck,
  deps: { store?: RateStore; now?: Date; demoEmails?: string } = {},
): Promise<RateResult> {
  const demoEmails = deps.demoEmails ?? process.env.DEMO_USER_EMAILS
  if (isWhitelisted(check.email, demoEmails)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
  }
  const now = deps.now ?? new Date()
  let store = deps.store
  if (!store) {
    store = (await import('./store')).dbStore
  }
  const ws = windowStartFor(now, check.windowMs)
  await store.cleanup(check.subject, new Date(now.getTime() - 86_400_000))
  const used = await store.current(check.key, check.subject, ws)
  if (used >= check.limit) {
    const retryAfterSec = Math.ceil((ws.getTime() + check.windowMs - now.getTime()) / 1000)
    return { allowed: false, remaining: 0, retryAfterSec }
  }
  await store.increment(check.key, check.subject, ws)
  return { allowed: true, remaining: check.limit - used - 1, retryAfterSec: 0 }
}
```

> Динамический `import('./store')` — чтобы юнит-тесты с инъектированным `store` не тянули БД-модуль.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/ratelimit/check.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Gates + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git add lib/ratelimit/index.ts lib/ratelimit/store.ts tests/lib/ratelimit/check.test.ts
git commit -m "feat(ratelimit): add checkRateLimit with injectable store"
```

---

### Task 11: Подключить rate-limit к генерации (429)

**Files:**
- Modify: `app/api/generate/stream/route.ts`

- [ ] **Step 1: Добавить проверку перед открытием стрима**

После блока валидации `parsed`, до резолва `sourcePlanTopicId`, вставить:

```ts
import { checkRateLimit } from '@/lib/ratelimit'
```

```ts
  const rl = await checkRateLimit({
    key: 'generate',
    subject: userId,
    email: session.user.email,
    limit: Number(process.env.MAX_GENERATIONS_PER_DAY ?? '10'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) {
    return Response.json(
      {
        error: `Дневной лимит генераций исчерпан. Попробуйте через ${Math.ceil(
          rl.retryAfterSec / 3600,
        )} ч.`,
      },
      { status: 429 },
    )
  }
```

- [ ] **Step 2: Verify gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/stream/route.ts
git commit -m "feat(api): rate-limit scenario generation per day"
```

---

### Task 12: Rate-limit логина по IP

**Files:**
- Modify: `app/(auth)/login/actions.ts`

- [ ] **Step 1: Добавить проверку по IP в начало `loginAction`**

Импорты сверху:

```ts
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/ratelimit'
```

После `if (!parsed.success) return { error: 'Введите корректные данные' }` добавить:

```ts
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim()
  const rl = await checkRateLimit({
    key: 'login',
    subject: ip,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rl.allowed) {
    return { error: 'Слишком много попыток входа. Повторите через несколько минут.' }
  }
```

> Без email/whitelist — это pre-auth, лимит по IP. `subject = ip`.

- [ ] **Step 2: Verify gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/login/actions.ts"
git commit -m "feat(auth): rate-limit login attempts by IP"
```

---

### Task 13: Rate-limit на upload, export, search

**Files:**
- Modify: `app/app/plans/actions.ts` (`analyzePlanAction`, 20/день)
- Modify: `app/api/scenarios/[id]/export/route.ts` (100/день, 429)
- Modify: `app/app/library/actions.ts` (`searchSharedAction`, 60/мин)

- [ ] **Step 1: upload — `analyzePlanAction`**

Импорт: `import { checkRateLimit } from '@/lib/ratelimit'`. После `if (!session?.user?.id) redirect('/login')` добавить:

```ts
  const rlUp = await checkRateLimit({
    key: 'upload',
    subject: session.user.id,
    email: session.user.email,
    limit: 20,
    windowMs: 86_400_000,
  })
  if (!rlUp.allowed) return { error: 'Превышен дневной лимит загрузок. Попробуйте завтра.' }
```

- [ ] **Step 2: export — route GET**

Импорт: `import { checkRateLimit } from '@/lib/ratelimit'`. После проверки auth (`if (!session?.user?.id) ...`) добавить:

```ts
  const rlEx = await checkRateLimit({
    key: 'export',
    subject: session.user.id,
    email: session.user.email,
    limit: 100,
    windowMs: 86_400_000,
  })
  if (!rlEx.allowed) return new Response('Превышен дневной лимит экспорта', { status: 429 })
```

- [ ] **Step 3: search — `searchSharedAction`**

Импорт: `import { checkRateLimit } from '@/lib/ratelimit'`. После `if (!session?.user?.id) redirect('/login')` добавить:

```ts
  const rlS = await checkRateLimit({
    key: 'search',
    subject: session.user.id,
    email: session.user.email,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rlS.allowed) return []
```

- [ ] **Step 4: Verify gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add app/app/plans/actions.ts "app/api/scenarios/[id]/export/route.ts" app/app/library/actions.ts
git commit -m "feat(ratelimit): wrap upload, export and search endpoints"
```

---

### Task 14: Документация env + финал

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` (раздел «Статус реализации»)

- [ ] **Step 1: `.env.example`**

Убедиться, что присутствуют (с комментариями на русском) и описаны:
```
# Лимиты (rate-limit). Whitelist — без лимита генераций (для демо жюри).
MAX_GENERATIONS_PER_DAY=10
DEMO_USER_EMAILS=
```
(Если уже есть — не дублировать, только проверить комментарий.)

- [ ] **Step 2: Финальные гейты целиком**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: тесты — baseline 146 + новые (sse 5, stream 2, partial 8, prompt 3, orchestrator 2, window 4, check 3 = +27 ≈ 173 pass) / 3 skip; lint/tsc/build чистые.

- [ ] **Step 3: Обновить «Статус реализации» в CLAUDE.md**

Добавить пункт «Plan 8 — ГОТОВ» с кратким перечнем (стриминг SSE двухэтапный, partial-json, rate_buckets + 5 точек лимитов + whitelist) и снять соответствующие пункты техдолга (rate-limit login/register частично — login сделан; rate-limit вообще). Отметить, что осталось из DoD: календарь, лендинг, CSRF logout, AUTH_URL derive, мягкий PII-warning, калибровка порога.

- [ ] **Step 4: Commit + tag**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: env limits + plan 8 streaming/ratelimit done status"
git tag streaming-ratelimit-done
```

---

## Финальное холистическое ревью (после Task 14)

Запустить `superpowers:requesting-code-review` по всему диффу ветки против `community-loop-done`. Фокус-чеклист:
1. **Стрим не ломает RAG/prematch** — оба best-effort шага сохранены в `streamScenario`.
2. **Изоляция данных** — `save`-замыкание и резолв `planTopicId` фильтруют по `userId`; rate-limit keyed правильно (login=IP, остальное=userId).
3. **Нет живой сети в юнит-тестах** — все стабы (`fetch`/deps); смоук-тесты с БД отдельно.
4. **Нормализация хронометража** применяется в стрим-пути (как в single-shot).
5. **Осиротевший код** — `generateScenarioAction` удалён, неиспользуемые импорты вычищены (biome зелёный).
6. **partial-json** не падает на типовых обрезках (покрыто тестами).
7. **429-сообщения на русском**, понятные пользователю.
8. **lazy cleanup** работает (DELETE старше 24ч на каждый вызов), без cron.

---

## Self-Review (против спеки)

**Spec coverage:**
- §5 [5] STREAM SKELETON → Task 2,4,5 (skeleton-стрим + билдер + оркестратор). ✅
- §5 [6] STREAM DETAILS → Task 4,5 (details-билдер + второй стрим). ✅
- §5 partial-json + skeleton-loader fallback → Task 3 (completer) + Task 7 (пульсация/fallback на error). ✅
- §8 Step 3 прогресс-бар «Структура → … → Готово» → Task 7 (фазы). ✅
- §5 [7] VALIDATE & SAVE (zod + нормализация + insert + embedding) → Task 5 (валидация/нормализация) + Task 6 (save). ✅
- §9 лимит генерации 10/день + whitelist → Task 11. ✅
- §9 login 5/15мин/IP → Task 12. ✅
- §9 upload 20/день, export 100/день, search 60 RPM → Task 13. ✅
- §9 rate_buckets lazy cleanup без cron → Task 8 + Task 10. ✅
- §10 unit-тесты без живой сети → все TDD-задачи инъектируют стабы. ✅

**Вне scope (осознанно, согласовано):** календарь (§8), лендинг (§8), CSRF logout, AUTH_URL derive, мягкий PII-warning при сохранении (§6 п.2), калибровка SIMILARITY_THRESHOLD (§7), проверка `russian` tsv. Кандидаты на Plan 9.

**Type consistency:** `StreamEvent` (stream.ts) ↔ клиентский парсер (GenerationStream.tsx) — поля `type`/`phase`/`data`/`index`/`scenarioId`/`message` совпадают. `RateStore`/`RateCheck`/`RateResult` едины в index.ts и используются в store.ts + тестах. `ScenarioSkeleton` един в schema.ts ↔ prompt.ts ↔ stream.ts.
