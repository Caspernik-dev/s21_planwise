# Загрузка своего материала как основы сценария (#29) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Учитель опционально прикладывает свой материал (PDF/DOCX/TXT) к генерации, материал обезличивается (diff+согласие как в планах), эфемерно чанкуется и retrieve-ится по теме, инъектится в промпт как ГЛАВНЫЙ источник.

**Architecture:** Разовая привязка к одной генерации, без миграций и без записи чанков в БД. Новый модуль `lib/material/*` (чанкинг + in-memory cosine-retrieval + prepare). Server action `analyzeMaterialAction` зеркалит `analyzePlanAction`. Stream-route готовит материал ДО открытия стрима и кладёт в `input.userMaterial`; промпт-билдеры инъектят `[TEACHER_MATERIAL]`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle (без миграций), Vitest, GigaChat embeddings, существующие `lib/parse` + `lib/pii`.

**Спека:** `docs/superpowers/specs/2026-05-24-user-material-source-design.md`

**Конвенции проекта:** один коммит на задачу; TDD для чистой логики; перед каждым коммитом — `pnpm test && pnpm lint && pnpm exec tsc --noEmit`; финальный — `pnpm build`.

---

### Task 1: Чанкинг материала `chunkMaterial`

**Files:**
- Create: `lib/material/chunk.ts`
- Test: `tests/lib/material/chunk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/material/chunk.test.ts
import { describe, expect, it } from 'vitest'
import { chunkMaterial } from '@/lib/material/chunk'

describe('chunkMaterial', () => {
  it('возвращает пустой массив на пустом/пробельном тексте', () => {
    expect(chunkMaterial('')).toEqual([])
    expect(chunkMaterial('   \n\n  ')).toEqual([])
  })

  it('упаковывает короткие абзацы в одно окно', () => {
    const text = 'Первый абзац.\n\nВторой абзац.\n\nТретий абзац.'
    const chunks = chunkMaterial(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Первый абзац.')
    expect(chunks[0]).toContain('Третий абзац.')
  })

  it('разбивает длинный текст на несколько окон (~800 токенов = ~2400 символов)', () => {
    const para = `${'а'.repeat(2000)}.`
    const text = [para, para, para].join('\n\n')
    const chunks = chunkMaterial(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('режет одиночный сверхдлинный абзац на куски', () => {
    const chunks = chunkMaterial('б'.repeat(5000))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/material/chunk.test.ts`
Expected: FAIL — `Cannot find module '@/lib/material/chunk'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/material/chunk.ts
const MAX_TOKENS = 800
const MAX_CHARS = MAX_TOKENS * 3 // эвристика chars/3 (локальный токенайзер запрещён)

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

export function chunkMaterial(text: string): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p
    if (estimateTokens(candidate) > MAX_TOKENS && buf) {
      out.push(buf)
      buf = p
    } else {
      buf = candidate
    }
    while (estimateTokens(buf) > MAX_TOKENS) {
      out.push(buf.slice(0, MAX_CHARS))
      buf = buf.slice(MAX_CHARS)
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/material/chunk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/material/chunk.ts tests/lib/material/chunk.test.ts
git commit -m "feat(material): чанкинг произвольного материала (#29)"
```

---

### Task 2: In-memory retrieval `selectRelevantMaterial`

**Files:**
- Create: `lib/material/retrieve.ts`
- Test: `tests/lib/material/retrieve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/material/retrieve.test.ts
import { describe, expect, it, vi } from 'vitest'
import { selectRelevantMaterial } from '@/lib/material/retrieve'

// мок-embed: вектор = [совпадение с "дружба", длина]
// query «дружба» → [1,0]; чанк с «дружба» → [1,0] (cosine=1); без — [0,1] (cosine=0)
function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((t) => (t.toLowerCase().includes('дружба') ? [1, 0] : [0, 1])),
  )
}

describe('selectRelevantMaterial', () => {
  it('ставит релевантные теме чанки первыми', async () => {
    const text = 'Про погоду и природу зимой.\n\nГлава про дружбу и взаимопомощь между людьми.'
    const { text: out } = await selectRelevantMaterial(text, 'дружба', {
      embed: fakeEmbed,
      maxChunks: 40,
      topK: 1,
      maxChars: 6000,
    })
    expect(out).toContain('дружбу')
    expect(out).not.toContain('погоду')
  })

  it('соблюдает maxChars', async () => {
    const text = `${'дружба '.repeat(500)}\n\n${'дружба '.repeat(500)}`
    const { text: out } = await selectRelevantMaterial(text, 'дружба', {
      embed: fakeEmbed,
      maxChunks: 40,
      topK: 10,
      maxChars: 100,
    })
    expect(out.length).toBeLessThanOrEqual(100)
  })

  it('ограничивает число эмбеддимых чанков (maxChunks)', async () => {
    const spy = vi.fn(fakeEmbed)
    const text = Array.from({ length: 60 }, (_, i) => `дружба абзац ${i} ${'x'.repeat(2400)}`).join(
      '\n\n',
    )
    await selectRelevantMaterial(text, 'дружба', { embed: spy, maxChunks: 5, topK: 3, maxChars: 6000 })
    // embed зовётся один раз с [query, ...не более 5 чанков] => длина ≤ 6
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].length).toBeLessThanOrEqual(6)
  })

  it('fallback на cap по символам при сбое embed', async () => {
    const failing = () => Promise.reject(new Error('network'))
    const text = 'дружба '.repeat(2000)
    const { text: out, truncated } = await selectRelevantMaterial(text, 'дружба', {
      embed: failing,
      maxChunks: 40,
      topK: 5,
      maxChars: 100,
    })
    expect(out.length).toBeLessThanOrEqual(100)
    expect(truncated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/material/retrieve.test.ts`
Expected: FAIL — `Cannot find module '@/lib/material/retrieve'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/material/retrieve.ts
import { embed as gigaEmbed } from '@/lib/gigachat/embeddings'
import { chunkMaterial } from './chunk'

export type SelectDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  maxChunks: number
  topK: number
  maxChars: number
}

function defaults(): SelectDeps {
  return {
    embed: gigaEmbed,
    maxChunks: Number(process.env.MATERIAL_MAX_CHUNKS ?? '40'),
    topK: Number(process.env.MATERIAL_TOP_K ?? '5'),
    maxChars: Number(process.env.MATERIAL_MAX_CHARS ?? '6000'),
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function capByChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

export async function selectRelevantMaterial(
  text: string,
  query: string,
  deps: Partial<SelectDeps> = {},
): Promise<{ text: string; truncated: boolean }> {
  const d = { ...defaults(), ...deps }
  const allChunks = chunkMaterial(text)
  if (allChunks.length === 0) return { text: '', truncated: false }

  const chunks = allChunks.slice(0, d.maxChunks)
  const cappedSource = allChunks.length > d.maxChunks

  let vectors: number[][]
  try {
    vectors = await d.embed([query, ...chunks])
  } catch {
    // материал первичен — не дропаем, отдаём начало текста
    return capByChars(chunks.join('\n\n'), d.maxChars)
  }
  const [qvec, ...cvecs] = vectors
  if (!qvec || cvecs.length !== chunks.length) {
    return capByChars(chunks.join('\n\n'), d.maxChars)
  }

  const ranked = chunks
    .map((c, i) => ({ c, score: cosine(qvec, cvecs[i]) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, d.topK)

  const picked: string[] = []
  let len = 0
  let truncated = cappedSource
  for (const r of ranked) {
    const piece = r.c
    if (len + piece.length > d.maxChars) {
      const remain = d.maxChars - len
      if (remain > 0) picked.push(piece.slice(0, remain))
      truncated = true
      break
    }
    picked.push(piece)
    len += piece.length + 2
  }
  return { text: picked.join('\n\n'), truncated }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/material/retrieve.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/material/retrieve.ts tests/lib/material/retrieve.test.ts
git commit -m "feat(material): in-memory retrieval материала по теме (#29)"
```

---

### Task 3: Серверная подготовка материала `prepareMaterial`

**Files:**
- Create: `lib/material/prepare.ts`
- Test: `tests/lib/material/prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/material/prepare.test.ts
import { describe, expect, it } from 'vitest'
import { prepareMaterial } from '@/lib/material/prepare'

describe('prepareMaterial', () => {
  it('обезличивает по умолчанию (consent=false)', () => {
    const r = prepareMaterial('Позвоните Ивану по 8-900-123-45-67.', false)
    expect(r.anonymized).toBe(true)
    expect(r.text).not.toContain('8-900-123-45-67')
    expect(r.piiCount).toBeGreaterThan(0)
  })

  it('при consent=true отдаёт сырой текст', () => {
    const raw = 'Позвоните Ивану по 8-900-123-45-67.'
    const r = prepareMaterial(raw, true)
    expect(r.anonymized).toBe(false)
    expect(r.text).toBe(raw)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/material/prepare.test.ts`
Expected: FAIL — `Cannot find module '@/lib/material/prepare'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/material/prepare.ts
import { detectAndAnonymize } from '@/lib/pii'

export function prepareMaterial(
  rawText: string,
  consent: boolean,
): { text: string; anonymized: boolean; piiCount: number } {
  if (consent) return { text: rawText, anonymized: false, piiCount: 0 }
  const report = detectAndAnonymize(rawText)
  return { text: report.anonymized, anonymized: true, piiCount: report.replacements.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/material/prepare.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/material/prepare.ts tests/lib/material/prepare.test.ts
git commit -m "feat(material): серверная подготовка материала (обезличивание/согласие) (#29)"
```

---

### Task 4: Поле `userMaterial` в схеме генерации

**Files:**
- Modify: `lib/scenario/schema.ts:33-39`

- [ ] **Step 1: Modify the schema**

В `generationInputSchema` добавить поле после `format`:

```ts
export const generationInputSchema = z.object({
  direction: z.enum(DIRECTIONS),
  grade: z.coerce.number().int().min(1).max(SPO_GRADE),
  topic: z.string().trim().min(1, 'Укажите тему').max(200),
  durationMin: z.coerce.number().int().min(5).max(120),
  format: z.enum(FORMATS),
  userMaterial: z.string().max(20_000).optional(),
})
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/scenario/schema.ts
git commit -m "feat(material): userMaterial в generationInputSchema (#29)"
```

---

### Task 5: Инъекция `[TEACHER_MATERIAL]` в промпт-билдеры

**Files:**
- Modify: `lib/scenario/prompt.ts`
- Test: `tests/lib/scenario/prompt-material.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/scenario/prompt-material.test.ts
import { describe, expect, it } from 'vitest'
import { buildBlockMessages, buildSkeletonMessages } from '@/lib/scenario/prompt'
import type { GenerationInput, ScenarioSkeleton } from '@/lib/scenario/schema'

const input: GenerationInput = {
  direction: 'Патриотическое',
  grade: 6,
  topic: 'Дружба',
  durationMin: 30,
  format: 'беседа',
}

const skeleton: ScenarioSkeleton = {
  title: 'Дружба',
  goals: ['цель'],
  values: ['дружба'],
  coreMeanings: ['смысл'],
  materials: [],
  stages: [{ kind: 'main', title: 'Основная', duration_min: 20, blocks: [] }],
}

describe('инъекция [TEACHER_MATERIAL]', () => {
  it('skeleton: секция отсутствует без материала', () => {
    const msgs = buildSkeletonMessages(input, [], [])
    expect(msgs.map((m) => m.content).join('\n')).not.toContain('[TEACHER_MATERIAL]')
  })

  it('skeleton: секция присутствует с материалом', () => {
    const msgs = buildSkeletonMessages(input, [], [], 'Мой конспект про дружбу.')
    const text = msgs.map((m) => m.content).join('\n')
    expect(text).toContain('[TEACHER_MATERIAL]')
    expect(text).toContain('Мой конспект про дружбу.')
    expect(text).toContain('ГЛАВНЫЙ источник')
  })

  it('block: секция присутствует с материалом', () => {
    const msgs = buildBlockMessages(
      input,
      skeleton,
      { kind: 'main', title: 'Основная', duration_min: 20 },
      { type: 'discussion', focus: 'дружба' },
      [],
      '',
      'Мой конспект про дружбу.',
    )
    const text = msgs.map((m) => m.content).join('\n')
    expect(text).toContain('[TEACHER_MATERIAL]')
    expect(text).toContain('Мой конспект про дружбу.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-material.test.ts`
Expected: FAIL — `buildSkeletonMessages` принимает 3 аргумента (4-й игнорируется) → секции нет.

- [ ] **Step 3: Modify `buildSkeletonMessages`**

Сигнатура (`lib/scenario/prompt.ts:131-135`) + тело. Добавить 4-й параметр и блок материала ВЫШЕ методички:

```ts
export function buildSkeletonMessages(
  input: GenerationInput,
  ragChunks: RagChunkForPrompt[] = [],
  sharedExamples: SharedExampleForPrompt[] = [],
  userMaterial = '',
): ChatMessage[] {
```

В `system`-массиве добавить строку перед `SKELETON_SCHEMA_HINT` (после строки про blocks):

```ts
    'Если ниже дан [TEACHER_MATERIAL] — это ГЛАВНЫЙ источник содержания и структуры; строй каркас прежде всего на нём, методички используй как дополнение.',
```

Перед `const methodology =` добавить:

```ts
  const material =
    userMaterial.trim().length > 0
      ? [
          '',
          '[TEACHER_MATERIAL] (ГЛАВНЫЙ источник — опирайся прежде всего на него, методички ниже вторичны):',
          userMaterial.trim(),
        ]
      : []
```

В `user`-массиве добавить `...material,` ПЕРЕД `...methodology,`.

- [ ] **Step 4: Modify `buildBlockMessages`**

Сигнатура (`lib/scenario/prompt.ts:201-208`) — добавить 7-й параметр:

```ts
export function buildBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): ChatMessage[] {
```

В `system`-массиве заменить правило про факты, чтобы материал тоже считался опорой. Найти строку:

```ts
    'которых нет в методичках выше ([RELEVANT_METHODOLOGY]). Нужен пример — подавай его как гипотетический',
```

заменить на:

```ts
    'которых нет в [TEACHER_MATERIAL] или методичках ([RELEVANT_METHODOLOGY]). Нужен пример — подавай его как гипотетический',
```

И добавить в `system` строку (после строки про runningContext-фокус, перед строкой про факты):

```ts
    'Если дан [TEACHER_MATERIAL] — это основной источник содержания этого блока, опирайся прежде всего на него.',
```

Перед `const methodology =` (внутри `buildBlockMessages`) добавить:

```ts
  const material =
    userMaterial.trim().length > 0
      ? [
          '',
          '[TEACHER_MATERIAL] (ГЛАВНЫЙ источник — опирайся прежде всего на него):',
          userMaterial.trim(),
        ]
      : []
```

В `user`-массиве добавить `...material,` ПЕРЕД `...methodology,`.

- [ ] **Step 5: Bump PROMPT_VERSION**

`lib/scenario/prompt.ts:4`:

```ts
export const PROMPT_VERSION = 'v8-material-2026-05-24'
```

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run tests/lib/scenario/prompt-material.test.ts`
Expected: PASS (3 tests). Also run full suite: `pnpm test` — все зелёные.

- [ ] **Step 7: Commit**

```bash
git add lib/scenario/prompt.ts tests/lib/scenario/prompt-material.test.ts
git commit -m "feat(material): инъекция [TEACHER_MATERIAL] в промпт (#29)"
```

---

### Task 6: Проброс `userMaterial` через `streamScenario`

**Files:**
- Modify: `lib/scenario/stream.ts:147,184-191`

- [ ] **Step 1: Pass material into skeleton builder**

`lib/scenario/stream.ts:147` — добавить 4-й аргумент:

```ts
    const skMessages = buildSkeletonMessages(input, ragChunks, sharedExamples, input.userMaterial ?? '')
```

- [ ] **Step 2: Pass material into block builder**

`lib/scenario/stream.ts:184-191` — `buildBlockMessages(...)` получает 7-й аргумент:

```ts
      const msgs: GigaMessage[] = buildBlockMessages(
        input,
        skeleton,
        st,
        brief,
        chunksForStage(ragChunks, st.kind),
        buildRunningContext(doneBlocks),
        input.userMaterial ?? '',
      )
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS (типы ок, все тесты зелёные — `streamScenario` юнит-тесты используют мок-deps, поведение без материала не изменилось).

- [ ] **Step 4: Commit**

```bash
git add lib/scenario/stream.ts
git commit -m "feat(material): проброс userMaterial в streamScenario (#29)"
```

---

### Task 7: Подготовка материала в stream-route

**Files:**
- Modify: `app/api/generate/stream/route.ts:22,42` (после `const input = parsed.data` и rate-limit)

- [ ] **Step 1: Add material preparation**

После блока rate-limit (`app/api/generate/stream/route.ts:40`, перед `let sourcePlanTopicId`) добавить:

```ts
  const rawMaterial = (body as { material?: { text?: unknown; consent?: unknown } })?.material
  if (rawMaterial && typeof rawMaterial.text === 'string' && rawMaterial.text.trim().length > 0) {
    try {
      const { prepareMaterial } = await import('@/lib/material/prepare')
      const { selectRelevantMaterial } = await import('@/lib/material/retrieve')
      const prepared = prepareMaterial(rawMaterial.text, rawMaterial.consent === true)
      const { text } = await selectRelevantMaterial(
        prepared.text,
        `${input.direction} ${input.topic}`,
      )
      if (text.trim().length > 0) input.userMaterial = text
    } catch (e) {
      console.error('material prep failed (non-fatal):', e)
    }
  }
```

(`input` — `let`? Сейчас `const input = parsed.data`. Поле `userMaterial` опционально в схеме; присвоение `input.userMaterial = text` работает на `const`-объекте. Оставить `const`.)

- [ ] **Step 2: Verify build**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/stream/route.ts
git commit -m "feat(material): подготовка материала в /api/generate/stream (#29)"
```

---

### Task 8: Server action `analyzeMaterialAction`

**Files:**
- Create: `app/app/new/material-actions.ts`

- [ ] **Step 1: Write the action**

```ts
// app/app/new/material-actions.ts
'use server'

import { auth } from '@/auth'
import { parseFile } from '@/lib/parse'
import { detectAndAnonymize } from '@/lib/pii'
import { checkRateLimit } from '@/lib/ratelimit'
import { redirect } from 'next/navigation'

export interface AnalyzeMaterialResult {
  error?: string
  ok?: {
    filename: string
    original: string
    anonymized: string
    replacements: Array<{ type: string; original: string; placeholder: string }>
  }
}

export async function analyzeMaterialAction(
  _prev: AnalyzeMaterialResult,
  formData: FormData,
): Promise<AnalyzeMaterialResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const rl = await checkRateLimit({
    key: 'material',
    subject: session.user.id,
    email: session.user.email,
    limit: Number(process.env.MAX_MATERIAL_PER_DAY ?? '20'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return { error: 'Превышен дневной лимит загрузок материала. Попробуйте завтра.' }

  const file = formData.get('material')
  if (!(file instanceof File) || file.size === 0) return { error: 'Выберите файл материала.' }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await parseFile({ buffer, filename: file.name, mimeType: file.type })
    if (!text || text.length < 10) return { error: 'Не удалось извлечь текст из файла.' }
    const report = detectAndAnonymize(text)
    return {
      ok: {
        filename: file.name,
        original: report.original,
        anonymized: report.anonymized,
        replacements: report.replacements,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка обработки файла.' }
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/app/new/material-actions.ts
git commit -m "feat(material): analyzeMaterialAction (parse + PII diff) (#29)"
```

---

### Task 9: UI — секция материала в форме `/app/new`

**Files:**
- Modify: `app/app/new/page.tsx`

Контекст: `NewScenarioForm` строит `payload` в `onGenerate` и передаёт в `<GenerationStream payload={...} />`. Добавляем опциональную секцию материала; результат анализа (original-текст + consent) кладём в `payload.material`.

- [ ] **Step 1: Add imports and state**

В начало `NewScenarioForm` (после существующих `useState`), добавить состояние материала и импорт action. Вверху файла добавить:

```ts
import { useActionState } from 'react'
import { type AnalyzeMaterialResult, analyzeMaterialAction } from './material-actions'
```

Внутри `NewScenarioForm` (рядом с прочими `useState`):

```ts
  const [materialAnalysis, materialAction, materialPending] = useActionState<
    AnalyzeMaterialResult,
    FormData
  >(analyzeMaterialAction, {})
  const [materialConsent, setMaterialConsent] = useState(false)
```

- [ ] **Step 2: Include material in payload**

В `onGenerate`, в объект `payload` добавить поле:

```ts
      material: materialAnalysis.ok
        ? { text: materialAnalysis.ok.original, consent: materialConsent }
        : undefined,
```

- [ ] **Step 3: Render material section in the form**

Внутри `<form ref={formRef}>`, ПЕРЕД кнопками генерации, вставить блок (отдельный `<form action={materialAction}>` НЕ вложен в основную — используем `formAction` на кнопке внутри основной формы, чтобы избежать вложенных форм):

```tsx
        <div className="rounded-lg ring-1 ring-neutral-200 p-4 space-y-3">
          <Label htmlFor="material">Свой материал (необязательно)</Label>
          <p className="text-sm text-neutral-500">
            Прикрепите статью, конспект или заметки (PDF, DOCX, TXT, до 5 МБ) — сценарий будет
            построен прежде всего на нём.
          </p>
          <input
            id="material"
            name="material"
            type="file"
            accept=".pdf,.docx,.txt"
            className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
          />
          <Button type="submit" variant="outline" formAction={materialAction} disabled={materialPending}>
            {materialPending ? 'Анализ…' : 'Проанализировать материал'}
          </Button>
          {materialAnalysis.error && (
            <p className="text-sm text-red-600">{materialAnalysis.error}</p>
          )}
          {materialAnalysis.ok && (
            <div className="space-y-2 text-sm">
              <p className="text-neutral-700">
                Файл: <strong>{materialAnalysis.ok.filename}</strong>.{' '}
                {materialAnalysis.ok.replacements.length > 0
                  ? `Найдено персональных данных: ${materialAnalysis.ok.replacements.length}. По умолчанию они будут обезличены.`
                  : 'Персональные данные не найдены.'}
              </p>
              {materialAnalysis.ok.replacements.length > 0 && (
                <>
                  <ul className="list-disc pl-5 text-neutral-600">
                    {materialAnalysis.ok.replacements.slice(0, 10).map((r) => (
                      <li key={`${r.original}-${r.placeholder}`}>
                        <span className="line-through">{r.original}</span> → {r.placeholder}
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={materialConsent}
                      onChange={(e) => setMaterialConsent(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-neutral-700">
                      Я понимаю, что эти данные будут отправлены во внешний сервис GigaChat без
                      обезличивания. Продолжить.
                    </span>
                  </label>
                </>
              )}
            </div>
          )}
        </div>
```

Примечание: `formAction={materialAction}` на кнопке внутри основной `<form>` отправляет форму в server action `analyzeMaterialAction` (имя файла = `material`), не запуская `onGenerate` (та на `onSubmit`/кнопке «Сгенерировать»). Это валидный паттерн React 19 (`useActionState` + `formAction`).

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: PASS. Роут `/app/new` в выводе build.

- [ ] **Step 5: Commit**

```bash
git add app/app/new/page.tsx
git commit -m "feat(material): UI секции материала в форме /app/new (#29)"
```

---

### Task 10: Финальная верификация

- [ ] **Step 1: Full gates**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: все зелёные; новые тесты (chunk 4 + retrieve 4 + prepare 2 + prompt 3 = 13) проходят; роуты `/app/new` и `/api/generate/stream` в выводе build.

- [ ] **Step 2: Обновить статус в CLAUDE.md и backlog**

В `docs/backlog.md` перенести #29 в «Сделано» (или пометить готовым), кратко описать реализацию. В `CLAUDE.md` — блок пост-milestone.

- [ ] **Step 3: Commit docs**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: #29 загрузка своего материала — реализовано (#29)"
```

---

## Ручной UAT (перед мержем/демо, требует живого GigaChat)

- Загрузить реальный PDF/DOCX/TXT с ПДн на `/app/new` → «Проанализировать» → проверить diff и счётчик ПДн.
- Сгенерировать БЕЗ согласия → убедиться, что в сценарии нет сырых ПДн и контент опирается на материал.
- Сгенерировать С согласием (чекбокс) → контент опирается на сырой материал.
- Большой файл (много страниц) → генерация не падает по латентности (cap чанков работает).
- Проверить, что генерация без материала работает как раньше (регресс).

## Заметки по deploy

Без миграций. Деплой: `git pull && docker compose up -d --build`. Новые env (опц., есть дефолты): `MATERIAL_MAX_CHUNKS=40`, `MATERIAL_TOP_K=5`, `MATERIAL_MAX_CHARS=6000`, `MAX_MATERIAL_PER_DAY=20`.
