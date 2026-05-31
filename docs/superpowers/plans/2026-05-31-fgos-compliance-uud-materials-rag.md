# ФГОС-compliance P3: УУД + RAG-ingest рабочих программ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить метапредметные результаты (УУД) из каталога ФГОС в генерацию, схему и экспорт; ингестировать ~45 рабочих программ из `materials/` в RAG для улучшения методики кружков и предметных курсов.

**Architecture:** Блок A — статический каталог `meta-results.ts` по образцу `personal-results.ts`, инъекция в skeleton-промпт, whitelist в `stream.ts`, группированный блок в экспорте. Блок B — скрипт `ingest-materials.ts` читает PDF из `materials/`, тегирует `lesson_type` по имени файла, ingests через существующий `lib/rag/` пайплайн; `retrieve.ts` получает мягкий `lesson_type`-фильтр.

**Tech Stack:** TypeScript, Zod, Drizzle/pgvector, GigaChat embeddings, pdf-parse, vitest

---

## Файловая карта

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `lib/scenario/meta-results.ts` | Create | Каталог УУД НОО/ООО/СОО + selectMetaResults + buildMetaCatalogSection |
| `tests/lib/scenario/meta-results.test.ts` | Create | TDD для selectMetaResults |
| `lib/scenario/schema.ts` | Modify | Добавить `metaSubjectResults` в `scenarioContentSchema` и `skeletonSchema` |
| `lib/scenario/prompts/rov.ts` | Modify | Инъекция `[META_RESULTS_CATALOG]` в skeleton-промпт + физкультминутка НОО |
| `lib/scenario/prompts/krujok.ts` | Modify | Инъекция `[META_RESULTS_CATALOG]` |
| `lib/scenario/prompts/literacy.ts` | Modify | Инъекция `[META_RESULTS_CATALOG]` |
| `lib/scenario/prompts/subject.ts` | Modify | Инъекция `[META_RESULTS_CATALOG]` |
| `lib/scenario/prompts/event.ts` | Modify | Инъекция `[META_RESULTS_CATALOG]` + физкультминутка НОО |
| `lib/scenario/stream.ts` | Modify | Применить `selectMetaResults` после `parseSkeleton` |
| `lib/export/document-model.ts` | Modify | Строка «Форма проведения» в шапку + блок «Метапредметные УУД» (группами) |
| `lib/scenario/quality.ts` | Modify | Warning физкультминутки для НОО ≥40 мин |
| `tests/lib/scenario/quality.test.ts` | Modify | Тест физкультминутки |
| `lib/rag/retrieve.ts` | Modify | Мягкий `lesson_type`-фильтр в SQL |
| `tests/lib/rag/retrieve.test.ts` | Modify | Тест lesson_type фильтра |
| `scripts/ingest-materials.ts` | Create | Ingest-скрипт для PDF из `materials/` |
| `package.json` | Modify | Добавить `ingest:materials` скрипт |

---

## Task 1: Каталог метапредметных УУД (TDD)

**Files:**
- Create: `lib/scenario/meta-results.ts`
- Create: `tests/lib/scenario/meta-results.test.ts`

- [ ] **Step 1: Написать тесты (TDD)**

```typescript
// tests/lib/scenario/meta-results.test.ts
import { describe, expect, it } from 'vitest'
import {
  type MetaCatalog,
  buildMetaCatalogSection,
  getMetaCatalog,
  selectMetaResults,
} from '@/lib/scenario/meta-results'

const catalog: MetaCatalog = {
  cognitive: ['Сравнивать объекты, устанавливать аналогии', 'Находить закономерности'],
  communicative: ['Воспринимать и формулировать суждения', 'Признавать возможность разных точек зрения'],
  regulatory: ['Планировать действия по решению учебной задачи'],
}

describe('selectMetaResults', () => {
  it('пустой input → добирает min по 1 из каждой группы', () => {
    const r = selectMetaResults(undefined, catalog)
    expect(r.cognitive.length).toBeGreaterThanOrEqual(1)
    expect(r.communicative.length).toBeGreaterThanOrEqual(1)
    expect(r.regulatory.length).toBeGreaterThanOrEqual(1)
  })

  it('валидные строки сохраняются', () => {
    const input = { cognitive: ['Сравнивать объекты, устанавливать аналогии'] }
    const r = selectMetaResults(input, catalog)
    expect(r.cognitive).toContain('Сравнивать объекты, устанавливать аналогии')
  })

  it('невалидные строки отфильтровываются и добирается из каталога', () => {
    const input = { cognitive: ['Выдуманная формулировка LLM'], communicative: [], regulatory: [] }
    const r = selectMetaResults(input, catalog)
    expect(r.cognitive).not.toContain('Выдуманная формулировка LLM')
    expect(r.cognitive.length).toBeGreaterThanOrEqual(1)
  })

  it('обрезает до 3 на группу', () => {
    const big = { cognitive: [...catalog.cognitive, 'X', 'Y'] }
    const r = selectMetaResults(big, catalog)
    expect(r.cognitive.length).toBeLessThanOrEqual(3)
  })

  it('пробелы нормализуются при сравнении', () => {
    const input = { cognitive: ['Сравнивать  объекты,  устанавливать аналогии'] }
    const r = selectMetaResults(input, catalog)
    // лишние пробелы нормализуются → строка совпадает с каталогом
    expect(r.cognitive).toContain('Сравнивать объекты, устанавливать аналогии')
  })

  it('buildMetaCatalogSection возвращает непустой массив строк', () => {
    const lines = buildMetaCatalogSection(catalog)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.some((l) => l.includes('Познавательные'))).toBe(true)
    expect(lines.some((l) => l.includes('Коммуникативные'))).toBe(true)
    expect(lines.some((l) => l.includes('Регулятивные'))).toBe(true)
  })

  it('getMetaCatalog возвращает каталог по уровню', () => {
    expect(getMetaCatalog('NOO').cognitive.length).toBeGreaterThan(0)
    expect(getMetaCatalog('OOO').communicative.length).toBeGreaterThan(0)
    expect(getMetaCatalog('SOO').regulatory.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```bash
pnpm test tests/lib/scenario/meta-results.test.ts
```
Expected: FAIL "Cannot find module '@/lib/scenario/meta-results'"

- [ ] **Step 3: Создать `lib/scenario/meta-results.ts`**

```typescript
import type { Level } from './levels'

export type MetaCatalog = {
  cognitive: string[]
  communicative: string[]
  regulatory: string[]
}

export type MetaSubjectResults = {
  cognitive?: string[]
  communicative?: string[]
  regulatory?: string[]
}

// Каталог дословных формулировок метапредметных результатов из ФГОС.
// НОО — приказ № 286 от 31.05.2021, п. 41.2.
// ООО — приказ № 287 от 31.05.2021, п. 42.2.
// СОО — приказ № 413 от 17.05.2012 в ред. № 732 от 12.08.2022, п. 7.2.
const META_CATALOG: Record<Level, MetaCatalog> = {
  NOO: {
    cognitive: [
      'Сравнивать объекты, устанавливать основания для сравнения, устанавливать аналогии',
      'Объединять части объекта (объекты) по определённому признаку',
      'Определять существенный признак для классификации',
      'Находить закономерности и противоречия в рассматриваемых фактах',
      'Выявлять недостаток информации для решения учебной задачи на основе предложенного алгоритма',
    ],
    communicative: [
      'Воспринимать и формулировать суждения, выражать эмоции в соответствии с целями и условиями общения',
      'Проявлять уважительное отношение к собеседнику, соблюдать правила ведения диалога',
      'Признавать возможность существования разных точек зрения',
      'Строить речевое высказывание в соответствии с поставленной задачей',
    ],
    regulatory: [
      'Планировать действия по решению учебной задачи для получения результата',
      'Устанавливать причины успеха/неудач учебной деятельности',
      'Корректировать свои учебные действия для преодоления ошибок',
    ],
  },
  OOO: {
    cognitive: [
      'Выявлять и характеризовать существенные признаки объектов (явлений)',
      'Устанавливать существенный признак классификации, основания для сравнения',
      'Выявлять закономерности и противоречия в рассматриваемых явлениях',
      'Выдвигать гипотезы об их связях и закономерностях',
      'Самостоятельно выбирать способ решения учебной задачи',
    ],
    communicative: [
      'Воспринимать и формулировать суждения, выражать эмоции в соответствии с целями и условиями общения',
      'Выражать свою точку зрения в устных и письменных текстах',
      'Понимать намерения других, проявлять уважительное отношение к собеседнику',
      'Сопоставлять свои суждения с суждениями других участников диалога',
    ],
    regulatory: [
      'Выявлять проблемы для решения в жизненных и учебных ситуациях',
      'Составлять план действий и определять необходимые ресурсы',
      'Устанавливать причины успеха/неудач учебной деятельности',
      'Вносить коррективы в деятельность на основе новых обстоятельств',
    ],
  },
  SOO: {
    cognitive: [
      'Владеть навыками получения информации из источников разных типов',
      'Самостоятельно формулировать и актуализировать проблему, рассматривать её всесторонне',
      'Выявлять закономерности и противоречия в рассматриваемых явлениях',
      'Анализировать полученные в ходе решения задачи результаты',
    ],
    communicative: [
      'Владеть различными способами общения и взаимодействия',
      'Развёрнуто и логично излагать свою точку зрения',
      'Понимать и использовать преимущества командной и индивидуальной работы',
      'Принимать цели совместной деятельности, организовывать и координировать действия по её достижению',
    ],
    regulatory: [
      'Самостоятельно осуществлять познавательную деятельность',
      'Владеть способами самоконтроля, самомотивации и рефлексии',
      'Давать оценку новым ситуациям, вносить коррективы в деятельность',
      'Принимать решения в условиях неопределённости',
    ],
  },
}

export function getMetaCatalog(level: Level): MetaCatalog {
  return META_CATALOG[level]
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function selectMetaResults(
  input: MetaSubjectResults | undefined,
  catalog: MetaCatalog,
): Required<MetaSubjectResults> {
  const filter = (items: string[] | undefined, pool: string[]): string[] => {
    const poolNorm = new Set(pool.map(normalize))
    const valid = (items ?? [])
      .map(normalize)
      .filter((s) => poolNorm.has(s))
      .slice(0, 3)
    if (valid.length === 0) return [pool[0]]
    return valid
  }

  return {
    cognitive: filter(input?.cognitive, catalog.cognitive),
    communicative: filter(input?.communicative, catalog.communicative),
    regulatory: filter(input?.regulatory, catalog.regulatory),
  }
}

export function buildMetaCatalogSection(catalog: MetaCatalog): string[] {
  return [
    '',
    '[META_RESULTS_CATALOG] Метапредметные результаты из ФГОС. Выбери 1-2 формулировки ДОСЛОВНО из каждой группы:',
    '',
    'Познавательные УУД:',
    ...catalog.cognitive.map((f, i) => `${i + 1}. ${f}`),
    '',
    'Коммуникативные УУД:',
    ...catalog.communicative.map((f, i) => `${i + 1}. ${f}`),
    '',
    'Регулятивные УУД:',
    ...catalog.regulatory.map((f, i) => `${i + 1}. ${f}`),
    '',
    'Верни в ключах "metaSubjectResults": { "cognitive": [...], "communicative": [...], "regulatory": [...] }.',
    'Копируй ДОСЛОВНО, без изменений. По 1-2 из каждой группы.',
  ]
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
pnpm test tests/lib/scenario/meta-results.test.ts
```
Expected: 6 passed

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/meta-results.ts tests/lib/scenario/meta-results.test.ts
git commit -m "feat(scenario): каталог метапредметных УУД ФГОС + selectMetaResults (TDD)"
```

---

## Task 2: Поле `metaSubjectResults` в схеме

**Files:**
- Modify: `lib/scenario/schema.ts`

- [ ] **Step 1: Добавить поле в `scenarioContentSchema` и `skeletonSchema`**

В `lib/scenario/schema.ts` найди `scenarioContentSchema` (строка ~27) и добавь поле после `personalResults`:

```typescript
// Было:
  personalResults: z.array(z.string().min(1)).max(8).optional(),
  metaResults: z.array(z.string().min(1)).max(10).optional(),

// Стало:
  personalResults: z.array(z.string().min(1)).max(8).optional(),
  metaSubjectResults: z
    .object({
      cognitive: z.array(z.string().min(1)).max(3).optional(),
      communicative: z.array(z.string().min(1)).max(3).optional(),
      regulatory: z.array(z.string().min(1)).max(3).optional(),
    })
    .optional(),
  metaResults: z.array(z.string().min(1)).max(10).optional(),
```

В `skeletonSchema` (строка ~107) добавь мягкую версию после `personalResults`:

```typescript
// Было:
  personalResults: z.array(z.string()).optional(),
  metaResults: z.array(z.string()).optional(),

// Стало:
  personalResults: z.array(z.string()).optional(),
  metaSubjectResults: z
    .object({
      cognitive: z.array(z.string()).optional(),
      communicative: z.array(z.string()).optional(),
      regulatory: z.array(z.string()).optional(),
    })
    .optional(),
  metaResults: z.array(z.string()).optional(),
```

- [ ] **Step 2: Проверить типы и тесты**

```bash
pnpm exec tsc --noEmit && pnpm test
```
Expected: tsc clean, все тесты проходят (no new failures)

- [ ] **Step 3: Коммит**

```bash
git add lib/scenario/schema.ts
git commit -m "feat(schema): поле metaSubjectResults для УУД (без миграции, jsonb)"
```

---

## Task 3: Инъекция УУД-каталога в промпты

**Files:**
- Modify: `lib/scenario/prompts/rov.ts`
- Modify: `lib/scenario/prompts/krujok.ts`
- Modify: `lib/scenario/prompts/literacy.ts`
- Modify: `lib/scenario/prompts/subject.ts`
- Modify: `lib/scenario/prompts/event.ts`

Паттерн одинаковый для всех файлов. Показан на примере `rov.ts`, остальные — по аналогии.

### 3а. `lib/scenario/prompts/rov.ts`

- [ ] **Step 1: Добавить импорт и секцию УУД в `buildRovSkeletonMessages`**

Найди импорты в начале файла и добавь:

```typescript
import { buildMetaCatalogSection, getMetaCatalog } from '@/lib/scenario/meta-results'
```

В `buildRovSkeletonMessages`, после блока `personalResultsBlock` (строка ~206), добавь секцию УУД и включи её в `user`:

```typescript
  const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
  const metaCatalogBlock = buildMetaCatalogSection(metaCatalog)

  // Физкультминутка для НОО ≥40 мин
  const physMinuteBlock =
    input.grade <= 4 && input.durationMin >= 40
      ? [
          '',
          'Включи в середину занятия двигательную паузу (физкультминутка, тип "task", 2-3 минуты).',
          'Пример: Учитель: — Встаньте. Мы немного разомнёмся...',
        ]
      : []

  const user = [
    'Построй каркас сценария внеурочного занятия:',
    `- Направление воспитания: ${input.direction}`,
    `- Аудитория: ${formatGradeForPrompt(input.grade)}`,
    `- Тема: ${input.topic}`,
    `- Длительность: ${input.durationMin} минут`,
    `- Формат: ${input.format}`,
    ...material,
    ...methodology,
    ...examples,
    ...personalResultsBlock,
    ...metaCatalogBlock,
    ...physMinuteBlock,
  ].join('\n')
```

Добавь `metaSubjectResults` в JSON-схему внутри `system`-промпта (найди блок со `"personalResults"` и добавь после него):

```typescript
// Найди в system-промпте строку с "personalResults": string[],  и после неё добавь:
'  "metaSubjectResults": {',
'    "cognitive": string[],   // 1-2 ДОСЛОВНЫХ формулировки из [META_RESULTS_CATALOG] → Познавательные',
'    "communicative": string[], // 1-2 ДОСЛОВНЫХ → Коммуникативные',
'    "regulatory": string[]    // 1-2 ДОСЛОВНЫХ → Регулятивные',
'  },',
```

- [ ] **Step 2: Обновить `lib/scenario/prompts/krujok.ts` — тот же паттерн**

```typescript
// Добавить импорт:
import { buildMetaCatalogSection, getMetaCatalog } from '@/lib/scenario/meta-results'

// В buildKrujokSkeletonMessages добавить перед формированием user-сообщения:
const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
const metaCatalogBlock = buildMetaCatalogSection(metaCatalog)

// Добавить ...metaCatalogBlock в массив user
// Добавить metaSubjectResults в JSON-схему system-промпта
```

- [ ] **Step 3: Обновить `lib/scenario/prompts/literacy.ts`** — тот же паттерн (без физкультминутки)

- [ ] **Step 4: Обновить `lib/scenario/prompts/subject.ts`** — тот же паттерн (без физкультминутки)

- [ ] **Step 5: Обновить `lib/scenario/prompts/event.ts`** — с физкультминуткой для НОО ≥40 мин

```typescript
// Добавить импорт:
import { buildMetaCatalogSection, getMetaCatalog } from '@/lib/scenario/meta-results'

// В buildEventSkeletonMessages добавить:
const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
const metaCatalogBlock = buildMetaCatalogSection(metaCatalog)
const physMinuteBlock =
  input.grade <= 4 && input.durationMin >= 40
    ? [
        '',
        'Включи в середину занятия двигательную паузу (физкультминутка, тип "task", 2-3 минуты).',
      ]
    : []

// Включить ...metaCatalogBlock, ...physMinuteBlock в user
// Добавить metaSubjectResults в JSON-схему
```

- [ ] **Step 6: Обновить `PROMPT_VERSION` во всех изменённых промптах**

В каждом файле найди константу `PROMPT_VERSION` (или `getPromptVersion`) и обнови значение:
- `rov.ts`: `v10-uud-2026-05-31`
- `krujok.ts`: `v10-uud-2026-05-31`
- `literacy.ts`: `v10-uud-2026-05-31`
- `subject.ts`: `v10-uud-2026-05-31`
- `event.ts`: `v10-uud-2026-05-31`

- [ ] **Step 7: Проверить сборку**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check lib/scenario/prompts/
```
Expected: 0 ошибок

- [ ] **Step 8: Коммит**

```bash
git add lib/scenario/prompts/
git commit -m "feat(prompts): инъекция [META_RESULTS_CATALOG] УУД + физкультминутка НОО ≥40мин (v10)"
```

---

## Task 4: Применить whitelist в `stream.ts`

**Files:**
- Modify: `lib/scenario/stream.ts`

- [ ] **Step 1: Добавить импорт**

```typescript
import { getMetaCatalog, selectMetaResults } from './meta-results'
```

- [ ] **Step 2: Применить whitelist после `selectPersonalResults`**

Найди блок whitelist личностных результатов (строка ~191) и после него добавь:

```typescript
    // Whitelist метапредметных УУД — применяется для ВСЕХ типов занятий (УУД универсальны).
    const metaCatalog = getMetaCatalog(gradeToLevel(input.grade))
    skeleton.metaSubjectResults = selectMetaResults(skeleton.metaSubjectResults, metaCatalog)
```

- [ ] **Step 3: Прокинуть поле в `content` при сборке сценария**

Найди объект `content` (строка ~250) где собирается `ScenarioContent` из skeleton и добавь:

```typescript
      metaSubjectResults: skeleton.metaSubjectResults,
```

- [ ] **Step 4: Проверить типы и тесты**

```bash
pnpm exec tsc --noEmit && pnpm test
```
Expected: tsc clean, все тесты проходят

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/stream.ts
git commit -m "feat(stream): whitelist metaSubjectResults УУД после parseSkeleton"
```

---

## Task 5: Форма проведения и УУД в экспорте

**Files:**
- Modify: `lib/export/document-model.ts`

- [ ] **Step 1: Добавить `deriveFormLabel` функцию**

В начале файла после импортов добавь:

```typescript
const FORM_LABEL: Record<string, string> = {
  беседа: 'беседа с элементами дискуссии',
  игра: 'дидактическая игра',
  'мастер-класс': 'практикум / мастер-класс',
  дебаты: 'групповая дискуссия / дебаты',
  'проектная сессия': 'проектная деятельность',
  киноклуб: 'просмотр и обсуждение',
  'исследование': 'исследовательская деятельность',
  'лаборатория': 'лабораторная работа',
  'эксперимент': 'практический эксперимент',
}

function deriveFormLabel(format: string): string {
  return FORM_LABEL[format.toLowerCase()] ?? format
}
```

- [ ] **Step 2: Добавить строку «Форма проведения» в `metaRows`**

Найди строку с `{ label: 'Формат', value: meta.format }` и добавь после неё:

```typescript
    { label: 'Форма проведения', value: deriveFormLabel(meta.format) },
```

- [ ] **Step 3: Добавить блок «Планируемые метапредметные результаты» (группами)**

Найди блок личностных результатов (строка ~80) и после него (перед блоком `metaResults`) добавь:

```typescript
  if (
    content.metaSubjectResults &&
    (content.metaSubjectResults.cognitive?.length ||
      content.metaSubjectResults.communicative?.length ||
      content.metaSubjectResults.regulatory?.length)
  ) {
    blocks.push({ type: 'heading', level: 2, text: 'Планируемые метапредметные результаты' })
    const msr = content.metaSubjectResults
    if (msr.cognitive?.length) {
      blocks.push({ type: 'paragraph', text: 'Познавательные УУД:' })
      blocks.push({ type: 'bullets', items: msr.cognitive })
    }
    if (msr.communicative?.length) {
      blocks.push({ type: 'paragraph', text: 'Коммуникативные УУД:' })
      blocks.push({ type: 'bullets', items: msr.communicative })
    }
    if (msr.regulatory?.length) {
      blocks.push({ type: 'paragraph', text: 'Регулятивные УУД:' })
      blocks.push({ type: 'bullets', items: msr.regulatory })
    }
  }
```

- [ ] **Step 4: Проверить тесты экспорта**

```bash
pnpm exec tsc --noEmit && pnpm test tests/lib/export/
```
Expected: все проходят (поля `optional` — старые тесты не сломаются)

- [ ] **Step 5: Коммит**

```bash
git add lib/export/document-model.ts
git commit -m "feat(export): строка 'Форма проведения' + блок метапредметных УУД (группами)"
```

---

## Task 6: Физкультминутка — warning в `checkScenario` (TDD)

**Files:**
- Modify: `lib/scenario/quality.ts`
- Modify: `tests/lib/scenario/quality.test.ts`

- [ ] **Step 1: Написать падающий тест**

Найди файл `tests/lib/scenario/quality.test.ts` и добавь в раздел `checkScenario`:

```typescript
  it('warning физкультминутки для НОО ≥40 мин без двигательной паузы', () => {
    const content = makeContent() // используй существующий хелпер makeContent из этого файла
    const input = makeInput({ grade: 3, durationMin: 40 })
    const { warnings } = checkScenario(content, input)
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(true)
  })

  it('нет warning физкультминутки для ООО (grade=5)', () => {
    const content = makeContent()
    const input = makeInput({ grade: 5, durationMin: 40 })
    const { warnings } = checkScenario(content, input)
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(false)
  })

  it('нет warning если в тексте активности есть физкультминутка', () => {
    const content = makeContent({
      stages: [
        {
          kind: 'engage' as const,
          title: 'Введение',
          duration_min: 5,
          activities: [{ type: 'task' as const, text: 'Физкультминутка. Встаньте.' }],
        },
        {
          kind: 'main' as const,
          title: 'Основная часть',
          duration_min: 30,
          activities: [{ type: 'discussion' as const, text: 'Обсуждение.' }],
        },
        {
          kind: 'reflection' as const,
          title: 'Рефлексия',
          duration_min: 5,
          activities: [
            {
              type: 'discussion' as const,
              text: 'Итоги.',
              questions: ['Что понравилось?', 'Что запомнилось?', 'Какой вывод сделали?'],
            },
          ],
        },
      ],
    })
    const input = makeInput({ grade: 3, durationMin: 40 })
    const { warnings } = checkScenario(content, input)
    expect(warnings.some((w) => w.includes('физкультминутк'))).toBe(false)
  })
```

Примечание: посмотри существующие тесты в файле чтобы понять сигнатуру `makeContent` и `makeInput`. Если их нет — используй прямой объект `ScenarioContent`.

- [ ] **Step 2: Запустить — убедиться что падают**

```bash
pnpm test tests/lib/scenario/quality.test.ts
```
Expected: FAIL на новых тестах

- [ ] **Step 3: Добавить логику в `checkScenario`**

В `lib/scenario/quality.ts` найди функцию `checkScenario` и добавь перед `return { warnings }`:

```typescript
  // Физкультминутка — нормативное требование СП 2.4.3648-20 п. 2.10.3
  if (input.grade <= 4 && input.durationMin >= 40) {
    const allText = content.stages
      .flatMap((s) => s.activities.map((a) => a.text))
      .join(' ')
      .toLowerCase()
    if (!/физкульт|двигат|встань|разминк/.test(allText)) {
      warnings.push(
        'Для начальной школы на занятии 40+ мин нормативно требуется физкультминутка (СП 2.4.3648-20 п. 2.10.3)',
      )
    }
  }
```

Убедись что `checkScenario` принимает второй аргумент `input` с полями `grade` и `durationMin`. Если сигнатура другая — подстройся под существующую.

- [ ] **Step 4: Запустить тесты**

```bash
pnpm test tests/lib/scenario/quality.test.ts
```
Expected: все проходят

- [ ] **Step 5: Запустить все тесты**

```bash
pnpm test
```
Expected: все проходят (или те же skip что и раньше)

- [ ] **Step 6: Коммит**

```bash
git add lib/scenario/quality.ts tests/lib/scenario/quality.test.ts
git commit -m "feat(quality): warning физкультминутки для НОО ≥40 мин (TDD, СП 2.4.3648-20)"
```

---

## Task 7: Мягкий `lesson_type`-фильтр в `retrieve.ts` (TDD)

**Files:**
- Modify: `lib/rag/retrieve.ts`
- Modify: `tests/lib/rag/retrieve.test.ts`

- [ ] **Step 1: Добавить `lessonType` в тип аргументов**

В `lib/rag/retrieve.ts` найди тип аргументов `retrieve`/`retrieveChunks` и добавь опциональное поле:

```typescript
// В типе RetrieveArgs (или аналогичном):
lessonType?: string
```

- [ ] **Step 2: Добавить фильтр в SQL-запрос**

Найди место где формируется `dirFilter` (строка ~47) и добавь аналогичный фильтр:

```typescript
  const typeFilter = args.lessonType
    ? sql`AND (chunk_meta->>'lesson_type' = ${args.lessonType} OR chunk_meta->>'lesson_type' IS NULL)`
    : sql``
```

Добавь `${typeFilter}` в SQL-запрос рядом с `${dirFilter}`.

- [ ] **Step 3: Прокинуть `lessonType` из `retrieveChunks` в `queryCandidates`**

Найди вызов `d.queryCandidates` и добавь `lessonType: query.lessonType`.

- [ ] **Step 4: Добавить тест**

В `tests/lib/rag/retrieve.test.ts` добавь тест для нового фильтра. Посмотри существующие тесты — они используют mock для `queryCandidates`. Добавь:

```typescript
  it('передаёт lessonType в queryCandidates', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const mockEmbed = vi.fn().mockResolvedValue([[...Array(2560).fill(0)]])
    await retrieveChunks(
      { topic: 'тест', grade: 5, direction: null, lessonType: 'krujok' },
      { queryCandidates: mockQuery, embed: mockEmbed },
    )
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ lessonType: 'krujok' }),
    )
  })
```

- [ ] **Step 5: Запустить тесты**

```bash
pnpm test tests/lib/rag/retrieve.test.ts
```
Expected: все проходят

- [ ] **Step 6: Прокинуть `lessonType` из генерации**

В `lib/scenario/stream.ts` найди вызов `retrieveChunks` и добавь `lessonType: input.lessonType`:

```typescript
    const ragChunks = await d.retrieve({
      topic: input.topic,
      grade: input.grade,
      direction: input.direction ?? null,
      lessonType: input.lessonType,
    })
```

- [ ] **Step 7: Проверить типы и все тесты**

```bash
pnpm exec tsc --noEmit && pnpm test
```
Expected: clean

- [ ] **Step 8: Коммит**

```bash
git add lib/rag/retrieve.ts tests/lib/rag/retrieve.test.ts lib/scenario/stream.ts
git commit -m "feat(rag): мягкий lesson_type-фильтр в retrieve — materials-корпус тегируется при ingest"
```

---

## Task 8: Скрипт `ingest-materials.ts`

**Files:**
- Create: `scripts/ingest-materials.ts`
- Modify: `package.json`

- [ ] **Step 1: Добавить `extraMeta` и nullable grades в `lib/rag/ingest.ts`**

В `lib/rag/ingest.ts` измени тип `IngestDoc` — сделай grades nullable и добавь `extraMeta`:

```typescript
export type IngestDoc = {
  source: string
  title: string
  direction: string | null
  gradeRange: string | null
  gradeMin: number | null   // null для документов без привязки к классу
  gradeMax: number | null   // null для документов без привязки к классу
  rawUrl: string
  text: string
  lang: string
  extraMeta?: Record<string, unknown>  // доп. поля в chunk_meta (напр. lesson_type)
}
```

В функции `ingestDocument`, в блоке `insertChunk`, добавь merge с `extraMeta`:

```typescript
      chunkMeta: {
        source: doc.source,
        document_title: doc.title,
        direction: doc.direction,
        grade_min: doc.gradeMin,
        grade_max: doc.gradeMax,
        section_kind: c.sectionKind,
        ...(c.stageIdx !== undefined ? { stage_idx: c.stageIdx } : {}),
        ...(doc.extraMeta ?? {}),   // добавь эту строку
      },
```

В SQL-запросе `retrieve.ts` grade-фильтр может упасть если `grade_min`/`grade_max` = null. Найди в `lib/rag/retrieve.ts` фильтр `(chunk_meta->>'grade_min')::int <= ${args.grade}` и обернии:

```typescript
  AND (chunk_meta->>'grade_min' IS NULL OR (chunk_meta->>'grade_min')::int <= ${args.grade})
  AND (chunk_meta->>'grade_max' IS NULL OR (chunk_meta->>'grade_max')::int >= ${args.grade})
```

- [ ] **Step 2: Создать скрипт `scripts/ingest-materials.ts`**

```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import fs from 'node:fs'
import path from 'node:path'
import { embed } from '@/lib/gigachat/embeddings'
import { ingestDocument } from '@/lib/rag/ingest'
import pdf from 'pdf-parse'

const MATERIALS_DIR = path.join(process.cwd(), 'materials')
const LANG = process.env.PG_TSV_LANG ?? 'russian'

// null = пропустить (нормативный документ, не методический)
function getLessonType(filename: string): string | null {
  const f = filename.toLowerCase()
  if (/^фгос |^фоп |^сан-эпид/.test(f)) return null
  if (/разговоры|мои горизонты|профориентац/.test(f)) return 'rov'
  if (/pvd_matemat|пвд.*(биолог|физик|хими|математик|инф культ)/.test(f)) return 'subject_extension'
  if (/обучение служением/.test(f)) return 'event'
  if (/программа вуд|программа_край|рабочая программа|рп курса|пфк/.test(f)) return 'krujok'
  if (/^пвд_/.test(f)) return 'krujok'
  return 'krujok'
}

async function main() {
  const { drizzleIngestDb } = await import('@/lib/rag/ingest-db')

  const files = fs.readdirSync(MATERIALS_DIR).filter((f) => f.endsWith('.pdf'))
  console.log(`Найдено ${files.length} PDF файлов`)

  let ingested = 0
  let skipped = 0

  for (const filename of files) {
    const lessonType = getLessonType(filename)
    if (!lessonType) {
      console.log(`  SKIP (нормативный): ${filename}`)
      skipped++
      continue
    }

    const filepath = path.join(MATERIALS_DIR, filename)
    const buffer = fs.readFileSync(filepath)

    let text: string
    try {
      const data = await pdf(buffer)
      text = data.text.trim()
    } catch (e) {
      console.error(`  ERROR парсинг PDF: ${filename}`, e)
      continue
    }

    if (text.length < 200) {
      console.log(`  SKIP (мало текста): ${filename}`)
      skipped++
      continue
    }

    try {
      const result = await ingestDocument(
        {
          source: 'materials',
          title: filename.replace('.pdf', ''),
          direction: null,
          gradeRange: null,
          gradeMin: null,
          gradeMax: null,
          rawUrl: `materials://${filename}`,
          text,
          lang: LANG,
          extraMeta: { lesson_type: lessonType },
        },
        { embed, db: drizzleIngestDb },
      )
      console.log(`  OK [${lessonType}] +${result.inserted} чанков (skip=${result.skipped}): ${filename}`)
      ingested++
    } catch (e) {
      console.error(`  ERROR ingest: ${filename}`, e)
    }
  }

  console.log(`\nГотово: ingested=${ingested}, skipped=${skipped}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 3: Добавить скрипт в `package.json`**

```json
"ingest:materials": "NODE_OPTIONS=--use-system-ca tsx scripts/ingest-materials.ts"
```

- [ ] **Step 4: Проверить типы**

```bash
pnpm exec tsc --noEmit
```
Expected: 0 ошибок

- [ ] **Step 5: Dry run (без реального ingest) — проверить маппинг**

Временно закомментируй вызов `ingestDocument` и добавь `console.log(filename, lessonType)`:

```bash
pnpm exec tsx scripts/ingest-materials.ts 2>&1 | head -30
```
Expected: список файлов с правильными `lesson_type`. Убедись что ФГОС/ФОП получают `null` (SKIP).

После проверки — верни вызов `ingestDocument`.

- [ ] **Step 6: Финальная проверка тестов и сборки**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm exec biome check lib/ scripts/ingest-materials.ts && pnpm build
```
Expected: все зелёные

- [ ] **Step 7: Коммит**

```bash
git add scripts/ingest-materials.ts package.json lib/rag/ingest.ts
git commit -m "feat(rag): скрипт ingest-materials для рабочих программ из materials/ (pnpm ingest:materials)"
```

---

## Task 9: Changelog и финальная проверка

**Files:**
- Modify: `lib/changelog.ts`

- [ ] **Step 1: Добавить записи в changelog**

В `lib/changelog.ts` найди последний объект версии и добавь пункты (или создай новую версию если нужно):

```typescript
{
  version: 'v1.10.0',
  date: '2026-05-31',
  changes: [
    { kind: 'feature', text: 'Метапредметные результаты (УУД) из каталога ФГОС в каждом сценарии — три группы: познавательные, коммуникативные, регулятивные' },
    { kind: 'improvement', text: 'Экспорт PDF/DOCX содержит строку «Форма проведения» и блок метапредметных УУД — полное соответствие требованиям ФГОС ООО п. 32.1' },
    { kind: 'improvement', text: 'Для 1–4 класса при длительности ≥40 мин — предупреждение о физкультминутке (СП 2.4.3648-20)' },
    { kind: 'improvement', text: 'RAG-корпус пополнен рабочими программами кружков и предметных курсов — точнее методика для не-РоВ занятий' },
  ],
},
```

- [ ] **Step 2: Финальный прогон всего**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm exec biome check && pnpm build
```
Expected: все зелёные, `pnpm build` выводит роуты без новых ошибок

- [ ] **Step 3: Коммит**

```bash
git add lib/changelog.ts
git commit -m "chore: changelog v1.10.0 — метапредметные УУД + физкультминутка + RAG-материалы"
```

---

## После деплоя (ручные шаги)

1. **Деплой:** `cd /home/nikit/planwise && git pull && docker compose up -d --build` (миграций нет)

2. **Ingest рабочих программ на проде:**
   ```bash
   pnpm ingest:materials
   ```
   Expected: ~45 документов ingested, ФГОС/ФОП/СанПиН скипнуты.

3. **Ручной UAT (живой GigaChat):**
   - Сгенерировать РоВ-сценарий → проверить блок «Планируемые метапредметные результаты» в редакторе и PDF/DOCX (3 группы УУД, дословные формулировки)
   - Проверить строку «Форма проведения» в шапке PDF
   - Сгенерировать кружок по теме из programs (напр. «Робототехника, 5 класс») → убедиться что retrieve подтягивает чанки из materials-корпуса
   - 1 класс 40 мин → сгенерировать → проверить предупреждение о физкультминутке в редакторе
