# Plan 5 — Экспорт PDF/DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю выгрузить сохранённый сценарий из редактора `/app/scenarios/[id]` в виде полного методического бланка PDF или DOCX.

**Architecture:** Server-side рендер в одном GET route handler `/api/scenarios/[id]/export?format=pdf|docx`. Route проверяет сессию и владение (`WHERE user_id`), читает последнюю сохранённую версию из БД и стримит файл. Общая чистая функция `buildScenarioDocument` маппит `ScenarioContent` → нейтральную модель блоков (heading/paragraph/bullets/metaTable), которую отдельно потребляют рендерер PDF (`@react-pdf/renderer`) и билдер DOCX (`docx`). Кнопки PDF/DOCX в тулбаре редактора — обычные download-ссылки на route.

**Tech Stack:** Next.js 15 App Router (route handler, runtime `nodejs`), `@react-pdf/renderer` v4 (без Puppeteer — RAM-бюджет 4 ГБ), `docx` v9, встроенный кириллический шрифт PT Sans (regular+bold) для PDF, Times New Roman для DOCX, Drizzle, Vitest.

**Решения, согласованные с пользователем (2026-05-20):**
- Точки входа: кнопки в тулбаре редактора → GET route handler, рендер на сервере.
- PDF встраивает PT Sans (regular+bold), TTF вендорятся в репо `assets/fonts/`. DOCX полагается на системный Times New Roman.
- Полный методический бланк (шапка с метаданными → цели → этапы с хронометражем и метками типов активностей и вопросами → материалы → адаптация).
- Изоляция данных по `user_id` — сейчас. Rate-limit экспорта 100/день (§9) — отложен в Plan 8 вместе с остальной rate-limit инфраструктурой.

**Конвенции (CLAUDE.md):** один коммит на задачу; TDD для нетривиальной логики (маппер модели документа); зелёные гейты `pnpm test && pnpm lint && pnpm tsc && pnpm build` перед каждым коммитом; UI только на русском.

---

## File Structure

| Файл | Ответственность | Действие |
|---|---|---|
| `package.json` | Зависимости `@react-pdf/renderer`, `docx` | Modify |
| `assets/fonts/PTSans-Regular.ttf`, `PTSans-Bold.ttf`, `OFL.txt` | Встраиваемый кириллический шрифт PDF | Create (vendored) |
| `next.config.ts` | `outputFileTracingIncludes` чтобы шрифты попали в standalone-сборку | Modify |
| `vitest.config.ts` | `esbuild.jsx: 'automatic'` для `.tsx` в тестах PDF | Modify |
| `lib/export/document-model.ts` | Чистый маппер `ScenarioContent` → `DocBlock[]` | Create |
| `lib/export/to-docx.ts` | `DocBlock[]` → `docx.Document` → `Buffer` | Create |
| `lib/export/to-pdf.tsx` | `DocBlock[]` → `@react-pdf` дерево → `Buffer`, регистрация шрифта | Create |
| `lib/export/index.ts` | Диспетчер формата + content-type | Create |
| `app/api/scenarios/[id]/export/route.ts` | GET: auth + изоляция + рендер + отдача файла | Create |
| `app/app/scenarios/[id]/editor.tsx` | Кнопки PDF/DOCX в тулбаре + подсказка про несохранённые изменения | Modify |
| `tests/lib/export/*.test.ts` | Юнит-тесты маппера, билдеров, диспетчера | Create |

---

### Task 1: Зависимости, шрифты, конфиг сборки

**Files:**
- Modify: `package.json` (через pnpm add)
- Create: `assets/fonts/PTSans-Regular.ttf`, `assets/fonts/PTSans-Bold.ttf`, `assets/fonts/OFL.txt`
- Modify: `next.config.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Установить зависимости**

```bash
pnpm add @react-pdf/renderer@^4.3.0 docx@^9.5.0
```

- [ ] **Step 2: Вендорить шрифт PT Sans (OFL) в репо**

```bash
mkdir -p assets/fonts
curl -fsSL -o assets/fonts/PTSans-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PTSans-Regular.ttf
curl -fsSL -o assets/fonts/PTSans-Bold.ttf    https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PTSans-Bold.ttf
curl -fsSL -o assets/fonts/OFL.txt            https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/OFL.txt
```

Проверь, что это реальные TTF, а не HTML-страница ошибки:

```bash
ls -l assets/fonts && file assets/fonts/PTSans-Regular.ttf
```

Expected: оба `.ttf` > 100 КБ, `file` сообщает `TrueType Font data` (или `OpenType`/`TrueType`). Если файл маленький или это HTML — URL устарел, найди актуальный путь к PT Sans в репозитории `google/fonts` (каталог `ofl/ptsans/`) и повтори.

- [ ] **Step 3: Включить шрифты в standalone-трейсинг Next**

Modify `next.config.ts` — добавь ключ верхнего уровня `outputFileTracingIncludes`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/scenarios/[id]/export': ['./assets/fonts/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
}

export default config
```

- [ ] **Step 4: Разрешить JSX в тестах PDF**

Modify `vitest.config.ts` — добавь блок `esbuild` (остальное не трогай):

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 5: Проверить, что установка не сломала гейты**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное (83 passed / 3 skipped в test), build успешен. Если `@react-pdf/renderer` конфликтует с React 19 RC (peer warning при install — норм; ошибка сборки/типов — нет), зафиксируй точную ошибку и не продолжай молча.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts vitest.config.ts assets/fonts
git commit -m "chore(export): add @react-pdf/renderer + docx deps and vendor PT Sans font"
```

---

### Task 2: Маппер модели документа (TDD)

Чистая функция, единственная нетривиальная логика фазы — покрываем тестами полностью. PDF и DOCX потребляют её результат, не зная про `ScenarioContent`.

**Files:**
- Create: `lib/export/document-model.ts`
- Test: `tests/lib/export/document-model.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `tests/lib/export/document-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_TYPE_LABEL,
  type ExportMeta,
  buildScenarioDocument,
} from '@/lib/export/document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'

const meta: ExportMeta = {
  title: 'Дружба',
  topic: 'О дружбе',
  direction: 'Патриотическое',
  grade: 3,
  durationMin: 40,
  format: 'Беседа',
}

const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы', 'Научиться договариваться'],
  materials: ['Карточки', 'Проектор'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 10,
      activities: [
        { type: 'discussion', text: 'Что такое дружба?', questions: ['А у вас есть друг?'] },
      ],
    },
    {
      kind: 'reflection',
      title: 'Итоги',
      duration_min: 5,
      activities: [{ type: 'task', text: 'Нарисуйте друга' }],
    },
  ],
  adaptations: { simpler: 'Меньше вопросов', harder: 'Эссе' },
}

describe('buildScenarioDocument', () => {
  it('начинается с заголовка названия и таблицы метаданных', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Дружба' })
    const metaBlock = blocks[1]
    expect(metaBlock.type).toBe('metaTable')
    if (metaBlock.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows).toEqual([
      { label: 'Тема', value: 'О дружбе' },
      { label: 'Направление', value: 'Патриотическое' },
      { label: 'Класс', value: '3' },
      { label: 'Длительность', value: '40 мин' },
      { label: 'Формат', value: 'Беседа' },
    ])
  })

  it('выводит цели списком', () => {
    const blocks = buildScenarioDocument(content, meta)
    const idx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Цель')
    expect(idx).toBeGreaterThan(-1)
    expect(blocks[idx + 1]).toEqual({
      type: 'bullets',
      items: ['Понять ценность дружбы', 'Научиться договариваться'],
    })
  })

  it('нумерует обычные этапы с хронометражем и помечает рефлексию', () => {
    const blocks = buildScenarioDocument(content, meta)
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toContain('Этап 1. Вовлечение (10 мин)')
    expect(headings).toContain('Рефлексия (5 мин)')
  })

  it('добавляет к активности метку типа и выводит вопросы списком', () => {
    const blocks = buildScenarioDocument(content, meta)
    const para = blocks.find((b) => b.type === 'paragraph' && b.text.includes('Что такое дружба?'))
    expect(para).toEqual({ type: 'paragraph', text: 'Обсуждение. Что такое дружба?' })
    const q = blocks.find((b) => b.type === 'bullets' && b.items.includes('А у вас есть друг?'))
    expect(q).toBeTruthy()
  })

  it('пропускает раздел материалов, если он пуст', () => {
    const blocks = buildScenarioDocument({ ...content, materials: [] }, meta)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Материалы')).toBe(false)
  })

  it('выводит адаптации двумя абзацами', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Проще: Меньше вопросов' })
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Сложнее: Эссе' })
  })

  it('экспортирует словарь меток типов активностей', () => {
    expect(ACTIVITY_TYPE_LABEL.discussion).toBe('Обсуждение')
    expect(ACTIVITY_TYPE_LABEL.video).toBe('Видео')
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/export/document-model.test.ts`
Expected: FAIL — модуль `@/lib/export/document-model` не найден.

- [ ] **Step 3: Реализовать маппер**

Create `lib/export/document-model.ts`:

```ts
import type { ScenarioContent } from '@/lib/scenario/schema'

export type ExportMeta = {
  title: string
  topic: string
  direction: string
  grade: number
  durationMin: number
  format: string
}

export type DocBlock =
  | { type: 'heading'; level: 1 | 2; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'metaTable'; rows: { label: string; value: string }[] }

export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  discussion: 'Обсуждение',
  quiz: 'Викторина',
  game: 'Игра',
  task: 'Задание',
  video: 'Видео',
}

export function buildScenarioDocument(content: ScenarioContent, meta: ExportMeta): DocBlock[] {
  const blocks: DocBlock[] = []

  blocks.push({ type: 'heading', level: 1, text: content.title })
  blocks.push({
    type: 'metaTable',
    rows: [
      { label: 'Тема', value: meta.topic },
      { label: 'Направление', value: meta.direction },
      { label: 'Класс', value: String(meta.grade) },
      { label: 'Длительность', value: `${meta.durationMin} мин` },
      { label: 'Формат', value: meta.format },
    ],
  })

  blocks.push({ type: 'heading', level: 2, text: 'Цель' })
  blocks.push({ type: 'bullets', items: content.goals })

  content.stages.forEach((stage, i) => {
    const heading =
      stage.kind === 'reflection'
        ? `Рефлексия (${stage.duration_min} мин)`
        : `Этап ${i + 1}. ${stage.title} (${stage.duration_min} мин)`
    blocks.push({ type: 'heading', level: 2, text: heading })

    for (const act of stage.activities) {
      const label = ACTIVITY_TYPE_LABEL[act.type] ?? act.type
      blocks.push({ type: 'paragraph', text: `${label}. ${act.text}` })
      if (act.questions && act.questions.length > 0) {
        blocks.push({ type: 'bullets', items: act.questions })
      }
    }
  })

  if (content.materials.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Материалы' })
    blocks.push({ type: 'bullets', items: content.materials })
  }

  blocks.push({ type: 'heading', level: 2, text: 'Адаптация' })
  blocks.push({ type: 'paragraph', text: `Проще: ${content.adaptations.simpler}` })
  blocks.push({ type: 'paragraph', text: `Сложнее: ${content.adaptations.harder}` })

  return blocks
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/export/document-model.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/export/document-model.ts tests/lib/export/document-model.test.ts
git commit -m "feat(export): map ScenarioContent to neutral document block model"
```

---

### Task 3: Билдер DOCX

Тонкий рендерер модели в `docx.Document`. Тяжёлая логика уже в Task 2, поэтому тест проверяет, что билдер отдаёт непустой валидный zip без исключений.

**Files:**
- Create: `lib/export/to-docx.ts`
- Test: `tests/lib/export/to-docx.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `tests/lib/export/to-docx.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ExportMeta } from '@/lib/export/document-model'
import { renderScenarioDocx } from '@/lib/export/to-docx'
import type { ScenarioContent } from '@/lib/scenario/schema'

const meta: ExportMeta = {
  title: 'Дружба', topic: 'О дружбе', direction: 'Патриотическое',
  grade: 3, durationMin: 40, format: 'Беседа',
}
const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  materials: ['Карточки'],
  stages: [
    { kind: 'engage', title: 'Вовлечение', duration_min: 40,
      activities: [{ type: 'discussion', text: 'Что такое дружба?', questions: ['Есть друг?'] }] },
  ],
  adaptations: { simpler: 'Проще', harder: 'Сложнее' },
}

describe('renderScenarioDocx', () => {
  it('возвращает непустой DOCX (zip с сигнатурой PK)', async () => {
    const buf = await renderScenarioDocx(content, meta)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/export/to-docx.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать билдер**

Create `lib/export/to-docx.ts`:

```ts
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { type ExportMeta, buildScenarioDocument } from './document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'

const FONT = 'Times New Roman'

export function buildScenarioDocx(content: ScenarioContent, meta: ExportMeta): Document {
  const blocks = buildScenarioDocument(content, meta)
  const children: Paragraph[] = []

  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: b.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            children: [new TextRun({ text: b.text, bold: true, font: FONT })],
          }),
        )
        break
      case 'paragraph':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, font: FONT })] }))
        break
      case 'bullets':
        for (const item of b.items) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: item, font: FONT })],
            }),
          )
        }
        break
      case 'metaTable':
        for (const row of b.rows) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${row.label}: `, bold: true, font: FONT }),
                new TextRun({ text: row.value, font: FONT }),
              ],
            }),
          )
        }
        break
    }
  }

  return new Document({ sections: [{ children }] })
}

export async function renderScenarioDocx(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  return Packer.toBuffer(buildScenarioDocx(content, meta))
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/export/to-docx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export/to-docx.ts tests/lib/export/to-docx.test.ts
git commit -m "feat(export): build DOCX from document model via docx"
```

---

### Task 4: Рендерер PDF с встроенным кириллическим шрифтом

**Files:**
- Create: `lib/export/to-pdf.tsx`
- Test: `tests/lib/export/to-pdf.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `tests/lib/export/to-pdf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ExportMeta } from '@/lib/export/document-model'
import { renderScenarioPdf } from '@/lib/export/to-pdf'
import type { ScenarioContent } from '@/lib/scenario/schema'

const meta: ExportMeta = {
  title: 'Дружба', topic: 'О дружбе', direction: 'Патриотическое',
  grade: 3, durationMin: 40, format: 'Беседа',
}
const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  materials: ['Карточки'],
  stages: [
    { kind: 'engage', title: 'Вовлечение', duration_min: 40,
      activities: [{ type: 'discussion', text: 'Что такое дружба?', questions: ['Есть друг?'] }] },
  ],
  adaptations: { simpler: 'Проще', harder: 'Сложнее' },
}

describe('renderScenarioPdf', () => {
  it('возвращает непустой PDF (сигнатура %PDF), шрифт регистрируется без ошибок', async () => {
    const buf = await renderScenarioPdf(content, meta)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/export/to-pdf.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать рендерер**

Create `lib/export/to-pdf.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { type DocBlock, type ExportMeta, buildScenarioDocument } from './document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const dir = path.join(process.cwd(), 'assets', 'fonts')
  Font.register({
    family: 'PT Sans',
    fonts: [
      { src: readFileSync(path.join(dir, 'PTSans-Regular.ttf')) },
      { src: readFileSync(path.join(dir, 'PTSans-Bold.ttf')), fontWeight: 'bold' },
    ],
  })
  fontsRegistered = true
}

const styles = StyleSheet.create({
  page: { fontFamily: 'PT Sans', fontSize: 11, padding: 48, lineHeight: 1.4, color: '#1a1a1a' },
  h1: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  h2: { fontSize: 13, fontWeight: 'bold', marginTop: 14, marginBottom: 6 },
  p: { marginBottom: 6 },
  bulletRow: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { fontWeight: 'bold', width: 110 },
  metaValue: { flex: 1 },
  metaTable: { marginBottom: 10 },
})

function renderBlock(b: DocBlock, i: number) {
  switch (b.type) {
    case 'heading':
      return (
        <Text key={i} style={b.level === 1 ? styles.h1 : styles.h2}>
          {b.text}
        </Text>
      )
    case 'paragraph':
      return (
        <Text key={i} style={styles.p}>
          {b.text}
        </Text>
      )
    case 'bullets':
      return (
        <View key={i}>
          {b.items.map((it, j) => (
            <View key={j} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{it}</Text>
            </View>
          ))}
        </View>
      )
    case 'metaTable':
      return (
        <View key={i} style={styles.metaTable}>
          {b.rows.map((r, j) => (
            <View key={j} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{r.label}</Text>
              <Text style={styles.metaValue}>{r.value}</Text>
            </View>
          ))}
        </View>
      )
  }
}

export function ScenarioPdf({ content, meta }: { content: ScenarioContent; meta: ExportMeta }) {
  const blocks = buildScenarioDocument(content, meta)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {blocks.map(renderBlock)}
      </Page>
    </Document>
  )
}

export async function renderScenarioPdf(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<ScenarioPdf content={content} meta={meta} />)
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/export/to-pdf.test.ts`
Expected: PASS. Если падает на JSX — проверь, что Task 1 Step 4 (vitest `esbuild.jsx: 'automatic'`) применён. Если падает на чтении шрифта — проверь Task 1 Step 2 (файлы существуют в `assets/fonts`).

- [ ] **Step 5: Commit**

```bash
git add lib/export/to-pdf.tsx tests/lib/export/to-pdf.test.ts
git commit -m "feat(export): render PDF with embedded PT Sans Cyrillic font"
```

---

### Task 5: Диспетчер формата + route handler

**Files:**
- Create: `lib/export/index.ts`
- Create: `app/api/scenarios/[id]/export/route.ts`
- Test: `tests/lib/export/index.test.ts`

- [ ] **Step 1: Написать падающий тест диспетчера**

Create `tests/lib/export/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ExportMeta } from '@/lib/export/document-model'
import { isExportFormat, renderScenarioExport } from '@/lib/export'
import type { ScenarioContent } from '@/lib/scenario/schema'

const meta: ExportMeta = {
  title: 'Дружба', topic: 'О дружбе', direction: 'Патриотическое',
  grade: 3, durationMin: 40, format: 'Беседа',
}
const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Цель'],
  materials: [],
  stages: [{ kind: 'engage', title: 'Этап', duration_min: 40,
    activities: [{ type: 'task', text: 'Текст' }] }],
  adaptations: { simpler: 'A', harder: 'B' },
}

describe('isExportFormat', () => {
  it('принимает pdf и docx, отвергает остальное', () => {
    expect(isExportFormat('pdf')).toBe(true)
    expect(isExportFormat('docx')).toBe(true)
    expect(isExportFormat('txt')).toBe(false)
    expect(isExportFormat(null)).toBe(false)
  })
})

describe('renderScenarioExport', () => {
  it('pdf → application/pdf, непустое тело', async () => {
    const out = await renderScenarioExport('pdf', content, meta)
    expect(out.contentType).toBe('application/pdf')
    expect(out.body.length).toBeGreaterThan(0)
    expect(out.ext).toBe('pdf')
  })

  it('docx → wordprocessingml content-type, непустое тело', async () => {
    const out = await renderScenarioExport('docx', content, meta)
    expect(out.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(out.body.length).toBeGreaterThan(0)
    expect(out.ext).toBe('docx')
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm exec vitest run tests/lib/export/index.test.ts`
Expected: FAIL — модуль `@/lib/export` не найден.

- [ ] **Step 3: Реализовать диспетчер**

Create `lib/export/index.ts`:

```ts
import type { ExportMeta } from './document-model'
import { renderScenarioDocx } from './to-docx'
import { renderScenarioPdf } from './to-pdf'
import type { ScenarioContent } from '@/lib/scenario/schema'

export type ExportFormat = 'pdf' | 'docx'

export function isExportFormat(v: string | null): v is ExportFormat {
  return v === 'pdf' || v === 'docx'
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function renderScenarioExport(
  format: ExportFormat,
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<{ body: Buffer; contentType: string; ext: ExportFormat }> {
  const body =
    format === 'pdf'
      ? await renderScenarioPdf(content, meta)
      : await renderScenarioDocx(content, meta)
  return { body, contentType: CONTENT_TYPE[format], ext: format }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm exec vitest run tests/lib/export/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Реализовать route handler**

Create `app/api/scenarios/[id]/export/route.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { isExportFormat, renderScenarioExport } from '@/lib/export'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

  const format = req.nextUrl.searchParams.get('format')
  if (!isExportFormat(format)) return new Response('Unsupported format', { status: 400 })

  const { id } = await params
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.userId, session.user.id)))
    .limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { body, contentType, ext } = await renderScenarioExport(format, row.content, {
    title: row.content.title,
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

  const asciiName = `scenario-${row.id}.${ext}`
  const utf8Name = encodeURIComponent(`${row.content.title}.${ext}`)
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Content-Length': String(body.length),
    },
  })
}
```

- [ ] **Step 6: Прогнать все гейты**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное; build видит новый route `/api/scenarios/[id]/export`.

- [ ] **Step 7: Commit**

```bash
git add lib/export/index.ts app/api/scenarios/\[id\]/export/route.ts tests/lib/export/index.test.ts
git commit -m "feat(export): add format dispatcher and GET export route with user_id isolation"
```

---

### Task 6: Кнопки экспорта в тулбаре редактора

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx` (блок тулбара с кнопкой «К дашборду», ~строки 113–116)

- [ ] **Step 1: Заменить одиночную кнопку на группу с PDF/DOCX**

В `app/app/scenarios/[id]/editor.tsx` найди:

```tsx
        <Button asChild variant="outline" size="sm">
          <Link href="/app">К дашборду</Link>
        </Button>
      </div>
```

Замени на:

```tsx
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/scenarios/${meta.id}/export?format=pdf`}>PDF</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/scenarios/${meta.id}/export?format=docx`}>DOCX</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app">К дашборду</Link>
            </Button>
          </div>
          {dirty && (
            <p className="text-xs text-neutral-500">
              Сохраните, чтобы экспорт включал последние изменения
            </p>
          )}
        </div>
      </div>
```

(`dirty` уже вычисляется в компоненте — строка `const dirty = JSON.stringify(content) !== savedJson`.)

- [ ] **Step 2: Прогнать гейты**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: зелёное. (Юнит-тестов на UI нет — корректность кнопок проверяется ручным браузерным UAT перед демо.)

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/\[id\]/editor.tsx
git commit -m "feat(export): add PDF/DOCX download buttons to scenario editor toolbar"
```

---

### Task 7: Финал — статус, холистическое ревью, тег

**Files:**
- Modify: `CLAUDE.md` (раздел «Статус реализации»)

- [ ] **Step 1: Обновить статус в CLAUDE.md**

Добавь в раздел «Статус реализации» строку о Plan 5 (по образцу предыдущих): что готово (route `/api/scenarios/[id]/export`, кнопки PDF/DOCX в тулбаре, маппер `lib/export/document-model.ts`, билдеры PDF/DOCX, встроенный PT Sans), зелёные гейты, и тех-долг: rate-limit экспорта 100/день → Plan 8; живой браузерный UAT экспорта (скачать оба формата, проверить кириллицу в PDF) — ручной шаг перед демо. Отметь Plan 6 как следующий.

- [ ] **Step 2: Финальный холистический code-review всей фазы**

Запусти ревью диффа `editor-done..HEAD` (skill `superpowers:requesting-code-review` / `code-review:code-review`). Особое внимание: изоляция `WHERE user_id` в route, отсутствие raw SQL, корректность Content-Disposition с UTF-8 именем, отсутствие утечки тяжёлых либ в клиентский бандл (всё в route/lib, не в `'use client'`).

- [ ] **Step 3: Прогнать полный набор гейтов в последний раз**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное (исходные 83 passed / 3 skipped + новые export-тесты: document-model 7, to-docx 1, to-pdf 1, index 3).

- [ ] **Step 4: Commit статуса и тег фазы**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): mark Plan 5 export done, record tech-debt"
git tag export-done
```

---

## Self-Review

**Spec coverage:**
- §5[10] EXPORT — PDF (@react-pdf/renderer) или DOCX (docx npm) → Tasks 3–5. ✅
- §8 Step 4 toolbar (PDF, DOCX) → Task 6. ✅
- §12 DoD «Экспорт PDF и DOCX» → Tasks 3–6. ✅
- §2 RAM-бюджет, без Puppeteer → используем @react-pdf/renderer + docx, server-side, без headless Chrome. ✅
- §9 изоляция по user_id → Task 5 route `WHERE user_id`. ✅ Rate-limit 100/день осознанно отложен в Plan 8 (согласовано).
- Кириллица в PDF → Task 1 (vendored PT Sans) + Task 4 (Font.register). ✅
- UI на русском → метки, заголовки, подсказки на русском. ✅

**Placeholder scan:** нет TBD/«добавить обработку ошибок» — все шаги содержат конкретный код и команды.

**Type consistency:** `ExportMeta`, `DocBlock`, `buildScenarioDocument`, `ACTIVITY_TYPE_LABEL` определены в Task 2 и потребляются единообразно в Tasks 3–5. `renderScenarioPdf`/`renderScenarioDocx`/`renderScenarioExport`/`isExportFormat` — сигнатуры совпадают между определением и вызовами в route и тестах. `ExportFormat` = `'pdf' | 'docx'`.
