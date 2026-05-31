# РоВ: приветствие отдельным блоком + видеовход с RuTube-поиском — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать первый блок РоВ-сценария настоящим приветствием учителя, а видеовход вторым блоком с автоматически сгенерированным поисковым запросом на RuTube + QR-кодом в экспорте.

**Architecture:** Skeleton-промпт инструктирует engage всегда из 2 блоков (discussion + video). Block-промпт для video просит вернуть поле `videoSearchQuery` (3-5 ключевых слов). Серверная санитизация заменяет любые прямые ссылки в `text` на маркер `[Просмотр ролика]` и добивает запрос, если модель пропустила. Экспорт PDF/DOCX рендерит URL `https://rutube.ru/search/?query=…` + QR-код через `qrcode` библиотеку.

**Tech Stack:** TypeScript + zod + Next.js 15 App Router. Тесты: vitest 2.1 (TDD для чистой логики). QR: `qrcode` v1.5 (переезжает из dev в prod deps).

**Спека:** `docs/superpowers/specs/2026-06-01-rov-greeting-video-design.md`.

**Worktree:** `.claude/worktrees/feat-rov-greeting-video`. **Ветка:** `feat/rov-greeting-video` (от master `66626a1`).

---

## Файловая карта

| Путь | Действие | Назначение |
|---|---|---|
| `lib/scenario/rutube.ts` | Создать | Регексы + sanitize/buildUrl/fallback (чистая логика, TDD) |
| `tests/lib/scenario/rutube.test.ts` | Создать | TDD-покрытие |
| `lib/scenario/schema.ts` | Изменить | `activitySchema.videoSearchQuery?` |
| `lib/scenario/prompts/rov.ts` | Изменить | Skeleton: engage=2 блока; Block: video-инструкции + greeting-инструкции; `PROMPT_VERSION → v13` |
| `lib/scenario/block-gen.ts` | Изменить | После `parseBlock` для video — санитизация text + fallback query |
| `lib/scenario/stream.ts` | Проверить | Возможно проброс ctx ({topic, direction, leadingValue}) в block-gen |
| `lib/export/qr.ts` | Создать | Обёртка над `qrcode.toDataURL` (brand-700 dark) |
| `tests/lib/export/qr.test.ts` | Создать | Смоук на префикс `data:image/png;base64,` |
| `package.json` | Изменить | `qrcode` из devDependencies → dependencies (типы `@types/qrcode` остаются в dev) |
| `lib/export/document-model.ts` | Изменить | Новый блок-тип `videoLink` после video-активности |
| `tests/lib/export/document-model.test.ts` | Изменить | Тест: video-активность с `videoSearchQuery` даёт `videoLink` блок |
| `lib/export/to-pdf.tsx` | Изменить | Рендер `videoLink` блока: карточка URL+QR |
| `lib/export/to-docx.ts` | Изменить | Рендер `videoLink` блока: hyperlink + ImageRun |
| `app/app/scenarios/[id]/editor.tsx` | Изменить | Поле `videoSearchQuery` + кнопка «🔍 Открыть на RuTube» на video-активностях |
| `lib/scenario/slides.ts` | Изменить | Слайд video — добавить буллет «RuTube: {query}» |
| `lib/changelog.ts` | Изменить | Запись v1.11.0 |

---

## Task 1 — `lib/scenario/rutube.ts` (TDD)

**Files:**
- Create: `lib/scenario/rutube.ts`
- Test: `tests/lib/scenario/rutube.test.ts`

- [ ] **Step 1: Тесты — написать сразу все, по красному**

```ts
// tests/lib/scenario/rutube.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  extractOrFallbackQuery,
  fallbackSearchQuery,
  sanitizeRutubeText,
} from '@/lib/scenario/rutube'

describe('sanitizeRutubeText', () => {
  it('заменяет прямую ссылку на ролик RuTube на маркер', () => {
    const input = 'Включаем https://rutube.ru/video/abc123/ и обсуждаем.'
    expect(sanitizeRutubeText(input)).toBe('Включаем [Просмотр ролика] и обсуждаем.')
  })

  it('заменяет ссылку YouTube watch-формата', () => {
    const input = 'Смотрим https://www.youtube.com/watch?v=dQw4w9WgXcQ дружно.'
    expect(sanitizeRutubeText(input)).toBe('Смотрим [Просмотр ролика] дружно.')
  })

  it('не трогает search-ссылку на RuTube', () => {
    const input = 'Откройте https://rutube.ru/search/?query=Дружба и ищите.'
    expect(sanitizeRutubeText(input)).toBe(input)
  })

  it('идемпотентна на тексте без ссылок', () => {
    expect(sanitizeRutubeText('Учитель: давайте обсудим.')).toBe('Учитель: давайте обсудим.')
  })
})

describe('buildSearchUrl', () => {
  it('собирает URL с URL-encoded query', () => {
    expect(buildSearchUrl('Дружба школьники')).toBe(
      'https://rutube.ru/search/?query=%D0%94%D1%80%D1%83%D0%B6%D0%B1%D0%B0%20%D1%88%D0%BA%D0%BE%D0%BB%D1%8C%D0%BD%D0%B8%D0%BA%D0%B8',
    )
  })

  it('тримит пробелы', () => {
    expect(buildSearchUrl('  Семья  ')).toBe('https://rutube.ru/search/?query=%D0%A1%D0%B5%D0%BC%D1%8C%D1%8F')
  })
})

describe('fallbackSearchQuery', () => {
  it('склеивает тему + направление + ведущую ценность', () => {
    expect(
      fallbackSearchQuery('День народного единства', 'Патриотическое', 'патриотизм'),
    ).toBe('День народного единства Патриотическое патриотизм')
  })

  it('пропускает undefined компоненты', () => {
    expect(fallbackSearchQuery('Дружба', undefined, undefined)).toBe('Дружба')
  })

  it('обрезает до 80 символов', () => {
    const q = fallbackSearchQuery(
      'Очень длинная и подробная тема о всём сразу для проверки лимита длины',
      'Духовно-нравственное',
      'высокие нравственные идеалы',
    )
    expect(q.length).toBeLessThanOrEqual(80)
  })
})

describe('extractOrFallbackQuery', () => {
  it('берёт валидный videoSearchQuery как есть', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: 'Дружба мультфильм', text: '...' },
        { topic: 'Дружба', direction: 'Духовно-нравственное', leadingValue: undefined },
      ),
    ).toBe('Дружба мультфильм')
  })

  it('игнорирует videoSearchQuery, если это URL, и идёт в fallback', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: 'https://rutube.ru/video/x/', text: '...' },
        { topic: 'Дружба', direction: undefined, leadingValue: undefined },
      ),
    ).toBe('Дружба')
  })

  it('возвращает fallback при пустом query', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: '   ', text: '...' },
        { topic: 'Семья', direction: undefined, leadingValue: undefined },
      ),
    ).toBe('Семья')
  })

  it('возвращает undefined для non-video активности', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'discussion', text: '...' },
        { topic: 'X', direction: undefined, leadingValue: undefined },
      ),
    ).toBeUndefined()
  })
})
```

- [ ] **Step 2: Запустить тесты — все красные**

```bash
pnpm test -- rutube
```
Ожидание: 11 тестов FAIL (модуль не существует).

- [ ] **Step 3: Реализовать `lib/scenario/rutube.ts`**

```ts
// Серверные хелперы для работы с видеоссылками в РоВ-сценариях.
// LLM запрещено выдумывать прямые URL — мы заменяем их маркером и собираем поисковую ссылку
// из ключевых слов, которые модель кладёт в activity.videoSearchQuery.

// http(s)://[www.]rutube.ru/video/{id}[/?…]
const RUTUBE_VIDEO_RE = /https?:\/\/(?:www\.)?rutube\.ru\/video\/[^\s]+/gi

// http(s)://[www.]youtube.com/watch?v=… ИЛИ youtu.be/…
const YOUTUBE_RE = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s]+|youtu\.be\/[^\s]+)/gi

export const VIDEO_PLACEHOLDER = '[Просмотр ролика]'

export function sanitizeRutubeText(text: string): string {
  return text.replace(RUTUBE_VIDEO_RE, VIDEO_PLACEHOLDER).replace(YOUTUBE_RE, VIDEO_PLACEHOLDER)
}

export function buildSearchUrl(query: string): string {
  return `https://rutube.ru/search/?query=${encodeURIComponent(query.trim())}`
}

const MAX_QUERY_LEN = 80

export function fallbackSearchQuery(
  topic: string,
  direction: string | undefined,
  leadingValue: string | undefined,
): string {
  const parts = [topic, direction, leadingValue].filter((p): p is string => !!p && p.trim() !== '')
  const joined = parts.join(' ').trim()
  if (joined.length <= MAX_QUERY_LEN) return joined
  // Грубо: обрезаем по последнему пробелу до лимита, чтобы не рвать слова.
  const cut = joined.slice(0, MAX_QUERY_LEN)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut
}

type ActivityForQuery = {
  type: string
  text: string
  videoSearchQuery?: string
}

type Ctx = {
  topic: string
  direction: string | undefined
  leadingValue: string | undefined
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

export function extractOrFallbackQuery(
  activity: ActivityForQuery,
  ctx: Ctx,
): string | undefined {
  if (activity.type !== 'video') return undefined
  const q = activity.videoSearchQuery?.trim()
  if (q && q.length > 0 && !looksLikeUrl(q)) return q
  return fallbackSearchQuery(ctx.topic, ctx.direction, ctx.leadingValue)
}
```

- [ ] **Step 4: Запустить тесты — все зелёные**

```bash
pnpm test -- rutube
```
Ожидание: 11 тестов PASS.

- [ ] **Step 5: tsc + biome**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/scenario/rutube.ts tests/lib/scenario/rutube.test.ts
```
Ожидание: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/scenario/rutube.ts tests/lib/scenario/rutube.test.ts
git commit -m "feat(rov): rutube.ts — sanitize + buildSearchUrl + fallback (TDD)"
```

---

## Task 2 — `lib/scenario/schema.ts`: `videoSearchQuery` в `activitySchema`

**Files:**
- Modify: `lib/scenario/schema.ts`

- [ ] **Step 1: Добавить поле в `activitySchema`**

Найти определение (около строки 12):

```ts
export const activitySchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  text: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
})
```

Заменить на:

```ts
export const activitySchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  text: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
  // Поисковой запрос на RuTube для type:'video'. Не URL, не название ролика — 3-5 ключевых слов.
  // Санитизация и fallback — в lib/scenario/rutube.ts.
  videoSearchQuery: z.string().min(1).max(120).optional(),
})
```

- [ ] **Step 2: tsc**

```bash
pnpm exec tsc --noEmit
```
Ожидание: clean. (Поле optional, существующие сценарии валидируются как раньше.)

- [ ] **Step 3: Прогон существующих тестов**

```bash
pnpm test -- schema
```
Ожидание: 54 passed (без новых тестов на этом шаге — поле тривиально optional).

- [ ] **Step 4: Commit**

```bash
git add lib/scenario/schema.ts
git commit -m "feat(rov): activitySchema — optional videoSearchQuery"
```

---

## Task 3 — `lib/scenario/prompts/rov.ts`: skeleton engage=2 блока + блок-инструкции + `PROMPT_VERSION v13`

**Files:**
- Modify: `lib/scenario/prompts/rov.ts`
- Test: `tests/lib/scenario/prompt.test.ts` (extension)

- [ ] **Step 1: Поднять `PROMPT_VERSION`**

```ts
export const PROMPT_VERSION = 'v13-rov-greeting-video-2026-06-01'
```

- [ ] **Step 2: Заменить старую инструкцию о видео в `buildRovSkeletonMessages`**

Найти в массиве `system`:

```ts
'- Первый блок мотивационной части — просмотр и обсуждение короткого видеоролика по теме. Не выдумывай ссылку и конкретное название ролика.',
```

Заменить двумя строками:

```ts
'- Мотивационно-целевой этап ВСЕГДА содержит ровно 2 блока: (1) приветствие учителя и постановка темы (type:"discussion"), (2) видеовход по теме (type:"video"). Не объединяй их в один блок.',
'- В стартовом приветствии достаточно 1-2 фраз ("Здравствуйте, ребята! Сегодня поговорим о…"), затем — переход к видео. Не растягивай приветствие на полстраницы.',
```

- [ ] **Step 3: Дополнить `SKELETON_SCHEMA_HINT` и `BLOCK_SCHEMA_HINT`**

В `BLOCK_SCHEMA_HINT` (около строки 264) дописать опц. поле перед закрывающей `}`:

```ts
const BLOCK_SCHEMA_HINT = `Верни JSON только для ОДНОГО блока:
{
  "type": "discussion" | "quiz" | "game" | "task" | "video",
  "text": string,
  "questions"?: string[],
  // Только для type:"video": 3-5 ключевых слов на русском для поиска ролика на RuTube.
  // НЕ URL, НЕ название конкретного ролика — просто запрос («Дружба школьники мультфильм»).
  "videoSearchQuery"?: string
}`
```

- [ ] **Step 4: Добавить инструкции в `buildRovBlockMessages` для video и приветствия**

Найти `system` сборку в `buildRovBlockMessages`. После строки `'Раскрывай именно фокус этого блока…'` добавить динамическую инструкцию:

```ts
const isVideoBlock = brief.type === 'video'
const isGreetingBlock =
  stage.kind === 'engage' && /приветств/iu.test(brief.focus)

const videoPolicy = isVideoBlock
  ? [
      '',
      'ВИДЕОВХОД:',
      '- Не выдумывай конкретное название ролика и не давай прямых ссылок (https://rutube.ru/video/..., youtube.com/watch...). Таких ссылок у тебя нет — они будут битые.',
      '- В "text" опиши, КАК учитель строит работу: 1-2 фразы перед просмотром, маркер «[Просмотр ролика]» отдельной строкой, затем обсуждение.',
      '- В поле "videoSearchQuery" верни 3-5 ключевых слов на русском для поиска подходящего ролика на RuTube. Без кавычек, без URL, без длинных описаний. Примеры: «День народного единства школьники», «Дружба взаимопомощь мультфильм».',
    ]
  : []

const greetingPolicy = isGreetingBlock
  ? [
      '',
      'ПРИВЕТСТВИЕ:',
      '- Это первый блок занятия. Начни с короткого приветствия учителя (1-2 фразы: «Здравствуйте, ребята! Сегодня поговорим о…»).',
      '- Затем одна содержательная реплика, формулирующая тему и цель.',
      '- Не лей воды — на приветствие отводится 1-2 минуты, потом сразу к видеовходу.',
    ]
  : []
```

И вставить `...videoPolicy, ...greetingPolicy` в `system` массив сразу после блока `'Раскрывай именно фокус этого блока…'`.

- [ ] **Step 5: Прогон существующих prompt-тестов**

```bash
pnpm test -- prompt
```
Ожидание: 18 passed (нет регрессий). Если какой-то тест ассертит старую строку про «Первый блок мотивационной части — просмотр…» — поправить ассерт на текущий текст.

- [ ] **Step 6: tsc + biome**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/scenario/prompts/rov.ts
```
Ожидание: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/scenario/prompts/rov.ts tests/lib/scenario/prompt.test.ts
git commit -m "feat(rov): промпт v13 — engage=приветствие+видео, videoSearchQuery, без выдуманных URL"
```

---

## Task 4 — `lib/scenario/block-gen.ts`: санитизация text + fallback videoSearchQuery для video-блоков

**Files:**
- Modify: `lib/scenario/block-gen.ts`

- [ ] **Step 1: Прочитать текущий `parseBlock` / `generateBlockWithGate`**

```bash
grep -n "parseBlock\|generateBlockWithGate" lib/scenario/block-gen.ts
```

Понять, где валидируется ответ модели после `chat()`.

- [ ] **Step 2: Расширить сигнатуру `generateBlockWithGate` опц. контекстом для fallback**

Найти текущую сигнатуру (что-то вроде):

```ts
export async function generateBlockWithGate(
  chat: ChatFn,
  msgs: ChatMessage[],
  stageKind: string,
  opts?: { lessonType?: LessonType; ... },
): Promise<...>
```

Добавить опц. поле в `opts`:

```ts
opts?: {
  lessonType?: LessonType
  videoCtx?: { topic: string; direction: string | undefined; leadingValue: string | undefined }
  ...
}
```

Внутри функции, после `parseBlock` и валидации, ДО возврата результата:

```ts
import { extractOrFallbackQuery, sanitizeRutubeText } from './rutube'

// ...

if (block.type === 'video') {
  const sanitized = sanitizeRutubeText(block.text)
  const query = opts?.videoCtx
    ? extractOrFallbackQuery(
        { type: 'video', text: sanitized, videoSearchQuery: block.videoSearchQuery },
        opts.videoCtx,
      )
    : block.videoSearchQuery
  return {
    ...result,
    value: { ...block, text: sanitized, videoSearchQuery: query },
  }
}
```

Точная структура зависит от того, как сейчас устроен `generateBlockWithGate`. Адаптировать.

- [ ] **Step 3: Прокинуть `videoCtx` из `stream.ts`**

В `lib/scenario/stream.ts` найти вызов `generateBlockWithGate` (около строки 240) и добавить опции:

```ts
const r = await generateBlockWithGate(chat, msgs, st.kind, {
  lessonType: input.lessonType,
  videoCtx: {
    topic: input.topic,
    direction: input.direction,
    leadingValue: skeleton.leadingValue,
  },
})
```

- [ ] **Step 4: tsc**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 5: Прогон тестов**

```bash
pnpm test
```
Ожидание: 549 passed / 3 skipped (без новых, без регрессий — block-gen тестов нет, изменения покрыты на уровне rutube).

- [ ] **Step 6: biome**

```bash
pnpm exec biome check lib/scenario/block-gen.ts lib/scenario/stream.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/scenario/block-gen.ts lib/scenario/stream.ts
git commit -m "feat(rov): block-gen — санитизация video-text + fallback videoSearchQuery"
```

---

## Task 5 — `qrcode` в prod deps + `lib/export/qr.ts`

**Files:**
- Modify: `package.json`
- Create: `lib/export/qr.ts`
- Test: `tests/lib/export/qr.test.ts`

- [ ] **Step 1: Переместить `qrcode` из `devDependencies` в `dependencies`**

```bash
pnpm remove --save-dev qrcode
pnpm add qrcode@^1.5.4
```
(`@types/qrcode` остаётся в devDependencies.)

- [ ] **Step 2: Реализовать `lib/export/qr.ts`**

```ts
import 'server-only'
import QRCode from 'qrcode'

// Фирменный brand-700 (зелёный) для совпадения с лого Planwise.
const BRAND_DARK = '#0e4f30'

export async function renderQrDataUrl(text: string, size = 160): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: size,
    color: { dark: BRAND_DARK, light: '#ffffff' },
  })
}
```

- [ ] **Step 3: Смоук-тест**

```ts
// tests/lib/export/qr.test.ts
import { describe, expect, it } from 'vitest'
import { renderQrDataUrl } from '@/lib/export/qr'

describe('renderQrDataUrl', () => {
  it('возвращает PNG data URL', async () => {
    const url = await renderQrDataUrl('https://example.com/')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(200)
  })

  it('кодирует кириллицу', async () => {
    const url = await renderQrDataUrl('https://rutube.ru/search/?query=Дружба')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })
})
```

- [ ] **Step 4: Прогон тестов**

```bash
pnpm test -- qr
```
Ожидание: 2 passed.

- [ ] **Step 5: tsc + biome**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/export/qr.ts tests/lib/export/qr.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/export/qr.ts tests/lib/export/qr.test.ts
git commit -m "feat(export): qrcode в prod deps + renderQrDataUrl (brand)"
```

---

## Task 6 — `lib/export/document-model.ts`: блок `videoLink` после video-активности

**Files:**
- Modify: `lib/export/document-model.ts`
- Modify: `tests/lib/export/document-model.test.ts`

- [ ] **Step 1: Расширить тип `DocBlock`**

Найти union `DocBlock` и добавить вариант:

```ts
export type DocBlock =
  | ...
  | { type: 'videoLink'; query: string; url: string }
```

- [ ] **Step 2: Импортировать `buildSearchUrl`**

```ts
import { buildSearchUrl } from '@/lib/scenario/rutube'
```

- [ ] **Step 3: Вставить генерацию блока `videoLink` в `buildScenarioDocument`**

Найти цикл по `stage.activities` (около строки 146):

```ts
for (const act of stage.activities) {
  const label = ACTIVITY_TYPE_LABEL[act.type] ?? act.type
  blocks.push({ type: 'paragraph', text: `${label}. ${act.text}` })
  if (act.questions && act.questions.length > 0) {
    blocks.push({ type: 'bullets', items: act.questions })
  }
}
```

После закрытия if (act.questions) добавить:

```ts
if (act.type === 'video' && act.videoSearchQuery) {
  blocks.push({
    type: 'videoLink',
    query: act.videoSearchQuery,
    url: buildSearchUrl(act.videoSearchQuery),
  })
}
```

- [ ] **Step 4: Добавить тесты**

```ts
describe('buildScenarioDocument — videoLink', () => {
  it('video с videoSearchQuery даёт videoLink после paragraph активности', () => {
    const content = makeMinimalContent({
      stages: [
        {
          kind: 'engage',
          title: 'Видеовход',
          duration_min: 5,
          activities: [
            {
              type: 'video',
              text: 'Учитель показывает ролик.',
              videoSearchQuery: 'Дружба школьники',
            },
          ],
        },
        // + рефлексия для валидности
      ],
    })
    const blocks = buildScenarioDocument(content, makeMeta({ lessonType: 'rov' }))
    const idx = blocks.findIndex(
      (b) => b.type === 'paragraph' && 'text' in b && b.text.includes('Учитель показывает ролик.'),
    )
    expect(idx).toBeGreaterThanOrEqual(0)
    const next = blocks[idx + 1]
    expect(next.type).toBe('videoLink')
    if (next.type === 'videoLink') {
      expect(next.query).toBe('Дружба школьники')
      expect(next.url).toBe('https://rutube.ru/search/?query=%D0%94%D1%80%D1%83%D0%B6%D0%B1%D0%B0%20%D1%88%D0%BA%D0%BE%D0%BB%D1%8C%D0%BD%D0%B8%D0%BA%D0%B8')
    }
  })

  it('video без videoSearchQuery НЕ даёт videoLink', () => {
    const content = makeMinimalContent({
      stages: [
        {
          kind: 'engage',
          title: 'Видео',
          duration_min: 5,
          activities: [{ type: 'video', text: 'Учитель показывает ролик.' }],
        },
      ],
    })
    const blocks = buildScenarioDocument(content, makeMeta({ lessonType: 'rov' }))
    expect(blocks.some((b) => b.type === 'videoLink')).toBe(false)
  })
})
```

(Использовать существующие фикстуры `makeMinimalContent`/`makeMeta` из теста.)

- [ ] **Step 5: Прогон**

```bash
pnpm test -- document-model
```
Ожидание: 35 passed (33 было + 2 новых).

- [ ] **Step 6: tsc + biome**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/export/document-model.ts tests/lib/export/document-model.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/export/document-model.ts tests/lib/export/document-model.test.ts
git commit -m "feat(export): блок videoLink после video-активности (TDD)"
```

---

## Task 7 — `lib/export/to-pdf.tsx`: рендер `videoLink` блока с URL + QR

**Files:**
- Modify: `lib/export/to-pdf.tsx`

- [ ] **Step 1: Импорт QR-хелпера**

```tsx
import { renderQrDataUrl } from './qr'
```

- [ ] **Step 2: Прочитать текущую структуру рендера в `to-pdf.tsx`**

```bash
grep -n "DocBlock\|switch\|case 'paragraph'\|case 'bullets'" lib/export/to-pdf.tsx
```

Найти, где `DocBlock` диспатчится в JSX react-pdf компоненты.

- [ ] **Step 3: Pre-render QR для всех videoLink блоков**

Так как react-pdf требует синхронных Image src (через base64), но `renderQrDataUrl` асинхронна — заранее сгенерить все QR перед вызовом рендера. В `renderScenarioPdf` (или эквиваленте) добавить:

```tsx
const videoLinkBlocks = blocks.filter((b): b is Extract<DocBlock, { type: 'videoLink' }> => b.type === 'videoLink')
const qrByUrl = new Map<string, string>()
for (const v of videoLinkBlocks) {
  qrByUrl.set(v.url, await renderQrDataUrl(v.url, 160))
}
```

Прокинуть `qrByUrl` в компонент `<Document>` как prop.

- [ ] **Step 4: Кейс рендера для `videoLink`**

В компоненте, который рендерит блоки, добавить ветку:

```tsx
case 'videoLink': {
  const qr = qrByUrl.get(block.url)
  return (
    <View
      key={i}
      style={{
        marginTop: 6,
        marginBottom: 10,
        padding: 8,
        backgroundColor: '#eaf4ef',
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#0e4f30',
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: 700, color: '#0e4f30', marginBottom: 4 }}>
          🔍 Поиск на RuTube
        </Text>
        <Text style={{ fontSize: 10, color: '#1a1a1a', marginBottom: 4 }}>{block.query}</Text>
        <Link src={block.url} style={{ fontSize: 8, color: '#0e4f30', textDecoration: 'underline' }}>
          {block.url}
        </Link>
      </View>
      {qr && <Image src={qr} style={{ width: 64, height: 64 }} />}
    </View>
  )
}
```

Импорты Link и Image — из `@react-pdf/renderer` (уже импортированы в файле).

- [ ] **Step 5: tsc + build**

```bash
pnpm exec tsc --noEmit
pnpm build
```
Ожидание: clean, `/api/scenarios/[id]/export` route в выводе.

- [ ] **Step 6: biome**

```bash
pnpm exec biome check lib/export/to-pdf.tsx
```

- [ ] **Step 7: Commit**

```bash
git add lib/export/to-pdf.tsx
git commit -m "feat(export): PDF — карточка RuTube с URL и QR под video-активностью"
```

---

## Task 8 — `lib/export/to-docx.ts`: hyperlink + ImageRun для `videoLink`

**Files:**
- Modify: `lib/export/to-docx.ts`

- [ ] **Step 1: Прочитать текущий маппинг блоков**

```bash
grep -n "DocBlock\|case 'paragraph'" lib/export/to-docx.ts
```

- [ ] **Step 2: Pre-render QR (как в PDF) — в обёртке `renderScenarioDocx`**

```ts
const videoLinkBlocks = blocks.filter((b): b is Extract<DocBlock, { type: 'videoLink' }> => b.type === 'videoLink')
const qrByUrl = new Map<string, Buffer>()
for (const v of videoLinkBlocks) {
  const dataUrl = await renderQrDataUrl(v.url, 160)
  const base64 = dataUrl.split(',')[1]
  qrByUrl.set(v.url, Buffer.from(base64, 'base64'))
}
```

- [ ] **Step 3: Ветка для `videoLink`**

В функции маппинга `DocBlock → docx.Paragraph[]` добавить:

```ts
case 'videoLink': {
  const qr = qrByUrl.get(block.url)
  const parts: Paragraph[] = []
  parts.push(
    new Paragraph({
      spacing: { before: 120 },
      children: [
        new TextRun({ text: '🔍 Поиск на RuTube: ', bold: true }),
        new TextRun({ text: block.query }),
      ],
    }),
  )
  parts.push(
    new Paragraph({
      children: [
        new ExternalHyperlink({
          link: block.url,
          children: [new TextRun({ text: block.url, style: 'Hyperlink' })],
        }),
      ],
    }),
  )
  if (qr) {
    parts.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: qr,
            transformation: { width: 120, height: 120 },
            type: 'png',
          }),
        ],
      }),
    )
  }
  return parts
}
```

Импорты: `ImageRun`, `ExternalHyperlink` из `docx`.

- [ ] **Step 4: tsc + build**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 5: biome**

```bash
pnpm exec biome check lib/export/to-docx.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/export/to-docx.ts
git commit -m "feat(export): DOCX — hyperlink + QR-изображение под video-активностью"
```

---

## Task 9 — `app/app/scenarios/[id]/editor.tsx`: поле `videoSearchQuery` + кнопка RuTube для video-активностей

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx`

- [ ] **Step 1: Импорт buildSearchUrl**

```ts
import { buildSearchUrl } from '@/lib/scenario/rutube'
```

- [ ] **Step 2: Найти место рендера активности**

```bash
grep -n "act.type\|activity.type\|videoSearchQuery" app/app/scenarios/\[id\]/editor.tsx
```

Найти JSX блок, где рендерятся `<Textarea>` для `act.text` и input'ы для `act.questions`.

- [ ] **Step 3: Добавить условный блок для `act.type === 'video'`**

После input'ов активности (Textarea text + questions) добавить:

```tsx
{act.type === 'video' && (
  <div className="space-y-1.5 rounded-md bg-brand-50 p-3 ring-1 ring-brand-100">
    <Label htmlFor={`videoQuery-${stageIdx}-${actIdx}`}>Поисковой запрос на RuTube</Label>
    <Input
      id={`videoQuery-${stageIdx}-${actIdx}`}
      placeholder="3-5 ключевых слов: «Дружба школьники мультфильм»"
      value={act.videoSearchQuery ?? ''}
      onChange={(e) =>
        update((c) => {
          const stages = [...c.stages]
          const acts = [...stages[stageIdx].activities]
          acts[actIdx] = { ...acts[actIdx], videoSearchQuery: e.target.value || undefined }
          stages[stageIdx] = { ...stages[stageIdx], activities: acts }
          return { ...c, stages }
        })
      }
    />
    {act.videoSearchQuery && act.videoSearchQuery.trim() !== '' && (
      <a
        href={buildSearchUrl(act.videoSearchQuery)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-brand-700 underline hover:text-brand-800"
      >
        🔍 Открыть на RuTube
      </a>
    )}
  </div>
)}
```

(Подстроить под реальные имена индексов `stageIdx`/`actIdx` — посмотреть существующие обработчики в файле.)

- [ ] **Step 4: tsc + biome + build**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check app/app/scenarios/\[id\]/editor.tsx
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add app/app/scenarios/\[id\]/editor.tsx
git commit -m "feat(rov): редактор — поле videoSearchQuery + кнопка «Открыть на RuTube» у video-блоков"
```

---

## Task 10 — `lib/scenario/slides.ts`: буллет «RuTube: {query}» в полноэкранном режиме

**Files:**
- Modify: `lib/scenario/slides.ts`
- Modify: `tests/lib/scenario/slides.test.ts` (если есть)

- [ ] **Step 1: Прочитать структуру `buildSlides`**

```bash
grep -n "buildSlides\|activity\|questions" lib/scenario/slides.ts
```

- [ ] **Step 2: Когда активность типа `video` имеет `videoSearchQuery`, добавить строку в bullets слайда**

В формирователе bullets для активности:

```ts
const bullets: string[] = []
if (act.questions && act.questions.length > 0) {
  bullets.push(...act.questions)
} else {
  bullets.push(act.text)
}
if (act.type === 'video' && act.videoSearchQuery) {
  bullets.push(`🔍 RuTube: ${act.videoSearchQuery}`)
}
```

(Адаптировать под реальную форму buildSlides.)

- [ ] **Step 3: Добавить тест (если есть test-файл)**

```ts
it('video с videoSearchQuery даёт буллет с поисковым запросом на RuTube', () => {
  const content = makeContent({
    stages: [
      {
        kind: 'engage',
        title: 'Видео',
        duration_min: 5,
        activities: [
          {
            type: 'video',
            text: 'Учитель показывает ролик.',
            videoSearchQuery: 'Дружба школьники',
          },
        ],
      },
    ],
  })
  const slides = buildSlides(content, makeMeta())
  const videoSlide = slides.find((s) => s.title.includes('Видео'))
  expect(videoSlide?.bullets).toContain('🔍 RuTube: Дружба школьники')
})
```

- [ ] **Step 4: Прогон тестов**

```bash
pnpm test -- slides
```

- [ ] **Step 5: tsc + biome**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check lib/scenario/slides.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/scenario/slides.ts tests/lib/scenario/slides.test.ts
git commit -m "feat(rov): презентационный режим — буллет с RuTube-запросом у video-блока"
```

---

## Task 11 — Changelog v1.11.0 + финальный прогон гейтов

**Files:**
- Modify: `lib/changelog.ts`

- [ ] **Step 1: Добавить запись v1.11.0 в начало массива**

```ts
{
  version: 'v1.11.0',
  date: '1 июня 2026',
  changes: [
    {
      kind: 'feature',
      text: 'Первый шаг РоВ-сценария теперь — настоящее приветствие учителя («Здравствуйте, ребята! Сегодня поговорим о…»), а видеовход становится отдельным вторым шагом.',
    },
    {
      kind: 'feature',
      text: 'У видео-активностей появилось поле «Поисковой запрос на RuTube» — модель сама подбирает ключевые слова, а вы одним кликом открываете готовый поиск. В PDF и DOCX рядом с ссылкой печатается QR-код для быстрого открытия с телефона.',
    },
    {
      kind: 'improvement',
      text: 'Если модель случайно сгенерировала прямую ссылку на видео (она почти всегда битая), сервер автоматически заменяет её на маркер «[Просмотр ролика]» и собирает поисковую ссылку из ключевых слов темы.',
    },
  ],
},
```

- [ ] **Step 2: Финальный прогон гейтов**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec biome check
pnpm build
```
Ожидание: всё зелёное, тестов в районе 560+ (549 + ~13 новых: rutube 11 + qr 2 + document-model 2).

- [ ] **Step 3: Commit**

```bash
git add lib/changelog.ts
git commit -m "chore: changelog v1.11.0 — приветствие отдельным блоком + RuTube-поиск"
```

---

## Гейты после каждой задачи
- `pnpm test` или таргетированный `pnpm test -- <pattern>` — зелёный.
- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec biome check <изменённые>` — clean.
- `pnpm build` — clean (для UI/экспорт-задач).
- Один атомарный коммит на задачу. БЕЗ Claude co-author footer.

## После мержа в master
- Деплой: `git pull && docker compose up -d --build` (миграций нет).
- Ручной UAT — см. SPEC §«Ручной UAT после деплоя» (7 шагов).
