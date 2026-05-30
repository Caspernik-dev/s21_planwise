# Соответствие сценариев ФГОС/ФОП (P1+P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в сценарии блок «Планируемые личностные результаты» из ФГОС (whitelist из статического каталога), расширить методическую шапку PDF/DOCX, ввести возрастной кап длительности и мягкую проверку рефлексии.

**Architecture:** Статический каталог `lib/scenario/personal-results.ts` (24 ячейки = 3 уровня × 8 канонических направлений). На skeleton-генерации каталог идёт в промпт, LLM выбирает 3–5 формулировок дословно; на выходе — whitelist-валидация и fallback к первым из каталога. UI редактора и share-страницы получают карточку, экспорт — расширенную шапку + блок результатов. Возрастной кап реализован через `superRefine` в `generationInputSchema`; проверка рефлексии — warning в `checkScenario`. Без миграций (поле живёт в jsonb `content`, optional).

**Tech Stack:** TypeScript, Next.js 15 App Router, zod, Drizzle (без изменений), Vitest, GigaChat (через существующий клиент).

**Спека:** `docs/superpowers/specs/2026-05-30-fgos-fop-compliance-p1-p2-design.md`.

---

## File Structure

**Создаём:**
- `lib/scenario/levels.ts` — `Level`, `gradeToLevel`, `CanonicalDirection`, `canonicalDirection`, `levelLabel`.
- `lib/scenario/personal-results.ts` — `CATALOG`, `getCatalog`, `validateAgainstCatalog`, `selectPersonalResults`.
- `tests/lib/scenario/levels.test.ts`
- `tests/lib/scenario/personal-results.test.ts`

**Изменяем:**
- `lib/scenario/schema.ts` — `personalResults` в `scenarioContentSchema` и `skeletonSchema`; `superRefine` для возрастного капа в `generationInputSchema`.
- `lib/scenario/prompt.ts` — секция `[PERSONAL_RESULTS_CATALOG]` в `buildSkeletonMessages`; bump `PROMPT_VERSION`.
- `lib/scenario/stream.ts` — после `parseSkeleton` вызвать `selectPersonalResults`.
- `lib/scenario/quality.ts` — два новых warning в `checkScenario`.
- `lib/export/document-model.ts` — расширенный `metaTable` + блок «Планируемые личностные результаты».
- `components/scenario/editor.tsx` — карточка редактирования личностных результатов.
- `components/share/ScenarioReadOnly.tsx` — рендер того же блока.
- `app/app/new/page.tsx` — фильтр опций `durationMin` по выбранному классу.
- `lib/changelog.ts` — запись v1.10.0.
- `tests/lib/scenario/schema.test.ts` (расширение) — кейсы для возрастного капа.
- `tests/lib/scenario/quality.test.ts` (расширение) — два warning'а про рефлексию.
- `tests/lib/scenario/stream.test.ts` (расширение) — fallback и whitelist на skeleton.
- `tests/lib/export/document-model.test.ts` (расширение) — методбланк + блок результатов.

---

## Task 1: Уровни образования и канонические направления

**Files:**
- Create: `lib/scenario/levels.ts`
- Test: `tests/lib/scenario/levels.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`tests/lib/scenario/levels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canonicalDirection, gradeToLevel, levelLabel } from '@/lib/scenario/levels'

describe('gradeToLevel', () => {
  it('маппит 1-4 → НОО', () => {
    for (const g of [1, 2, 3, 4]) expect(gradeToLevel(g)).toBe('NOO')
  })
  it('маппит 5-9 → ООО', () => {
    for (const g of [5, 6, 7, 8, 9]) expect(gradeToLevel(g)).toBe('OOO')
  })
  it('маппит 10-11 → СОО', () => {
    for (const g of [10, 11]) expect(gradeToLevel(g)).toBe('SOO')
  })
  it('маппит 12 (СПО) → СОО', () => {
    expect(gradeToLevel(12)).toBe('SOO')
  })
})

describe('canonicalDirection', () => {
  it('канонические — identity', () => {
    expect(canonicalDirection('Гражданское')).toBe('Гражданское')
    expect(canonicalDirection('Патриотическое')).toBe('Патриотическое')
    expect(canonicalDirection('Познавательное')).toBe('Познавательное')
    expect(canonicalDirection('Физическое и здоровье')).toBe('Физическое и здоровье')
  })
  it('Семейные ценности → Духовно-нравственное', () => {
    expect(canonicalDirection('Семейные ценности')).toBe('Духовно-нравственное')
  })
  it('Профориентация → Трудовое', () => {
    expect(canonicalDirection('Профориентация')).toBe('Трудовое')
  })
  it('Здоровый образ жизни → Физическое и здоровье', () => {
    expect(canonicalDirection('Здоровый образ жизни')).toBe('Физическое и здоровье')
  })
})

describe('levelLabel', () => {
  it('возвращает короткие лейблы', () => {
    expect(levelLabel('NOO')).toBe('НОО')
    expect(levelLabel('OOO')).toBe('ООО')
    expect(levelLabel('SOO')).toBe('СОО')
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
pnpm exec vitest run tests/lib/scenario/levels.test.ts
```

Ожидание: FAIL — модуль `@/lib/scenario/levels` не существует.

- [ ] **Step 3: Реализовать `lib/scenario/levels.ts`**

```ts
import type { DIRECTIONS } from './options'

export type Level = 'NOO' | 'OOO' | 'SOO'

export type Direction = (typeof DIRECTIONS)[number]

export type CanonicalDirection =
  | 'Гражданское'
  | 'Патриотическое'
  | 'Духовно-нравственное'
  | 'Эстетическое'
  | 'Физическое и здоровье'
  | 'Трудовое'
  | 'Экологическое'
  | 'Познавательное'

export function gradeToLevel(grade: number): Level {
  if (grade <= 4) return 'NOO'
  if (grade <= 9) return 'OOO'
  return 'SOO' // 10, 11, 12 (СПО)
}

const DIRECTION_MAP: Record<Direction, CanonicalDirection> = {
  'Гражданское': 'Гражданское',
  'Патриотическое': 'Патриотическое',
  'Духовно-нравственное': 'Духовно-нравственное',
  'Эстетическое': 'Эстетическое',
  'Физическое и здоровье': 'Физическое и здоровье',
  'Трудовое': 'Трудовое',
  'Экологическое': 'Экологическое',
  'Познавательное': 'Познавательное',
  'Семейные ценности': 'Духовно-нравственное',
  'Профориентация': 'Трудовое',
  'Здоровый образ жизни': 'Физическое и здоровье',
}

export function canonicalDirection(direction: Direction): CanonicalDirection {
  return DIRECTION_MAP[direction]
}

const LEVEL_LABEL: Record<Level, string> = {
  NOO: 'НОО',
  OOO: 'ООО',
  SOO: 'СОО',
}

export function levelLabel(level: Level): string {
  return LEVEL_LABEL[level]
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

```bash
pnpm exec vitest run tests/lib/scenario/levels.test.ts
```

Ожидание: PASS — все 8 тестов зелёные.

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/levels.ts tests/lib/scenario/levels.test.ts
git commit -m "feat(scenario): уровни образования и канонические направления для ФГОС

gradeToLevel(1..12)→НОО/ООО/СОО (СПО=12 идёт в СОО);
canonicalDirection — маппинг 11 UI-направлений на 8 канонических
ФГОС (Семейные ценности→Духовно-нравственное, Профориентация→
Трудовое, ЗОЖ→Физическое и здоровье); levelLabel для UI/экспорта.
Базис для каталога личностных результатов."
```

---

## Task 2: Скелет каталога личностных результатов + `getCatalog`

**Files:**
- Create: `lib/scenario/personal-results.ts`
- Test: `tests/lib/scenario/personal-results.test.ts`

> На этом шаге создаём ТОЛЬКО структуру и `getCatalog`. Реальное содержимое
> ячеек добавляется в Task 4 (отдельная задача — это ручная выписка из ФГОС).
> Пока в каждой ячейке держим один placeholder, чтобы тесты структуры прошли,
> а Task 4 их заполнит. Это намеренное промежуточное состояние внутри плана —
> между Task 2 и Task 4 продакшен не катится.

- [ ] **Step 1: Написать падающие тесты структуры**

`tests/lib/scenario/personal-results.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG, getCatalog } from '@/lib/scenario/personal-results'
import type { CanonicalDirection, Level } from '@/lib/scenario/levels'

const LEVELS: Level[] = ['NOO', 'OOO', 'SOO']
const CANONICAL: CanonicalDirection[] = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
]

describe('CATALOG', () => {
  it('содержит ячейку для каждой пары (уровень, каноническое направление)', () => {
    for (const lvl of LEVELS) {
      for (const dir of CANONICAL) {
        expect(CATALOG[lvl][dir]).toBeDefined()
        expect(CATALOG[lvl][dir].length).toBeGreaterThan(0)
      }
    }
  })
  it('каждая формулировка непустая и trim-ed', () => {
    for (const lvl of LEVELS) {
      for (const dir of CANONICAL) {
        for (const f of CATALOG[lvl][dir]) {
          expect(f.trim()).toBe(f)
          expect(f.length).toBeGreaterThan(10)
        }
      }
    }
  })
})

describe('getCatalog', () => {
  it('возвращает ячейку по каноническому направлению напрямую', () => {
    expect(getCatalog('NOO', 'Патриотическое')).toBe(CATALOG.NOO.Патриотическое)
  })
  it('маппит UI-лейблы на канонические (Семейные ценности → Духовно-нравственное)', () => {
    expect(getCatalog('OOO', 'Семейные ценности')).toBe(CATALOG.OOO['Духовно-нравственное'])
  })
  it('маппит ЗОЖ → Физическое и здоровье', () => {
    expect(getCatalog('SOO', 'Здоровый образ жизни')).toBe(CATALOG.SOO['Физическое и здоровье'])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
```

Ожидание: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать `lib/scenario/personal-results.ts` (со скелетом каталога)**

```ts
import { type CanonicalDirection, type Direction, type Level, canonicalDirection } from './levels'

// PLACEHOLDER каталога личностных результатов из ФГОС НОО/ООО/СОО × 8 канонических направлений.
// Реальные дословные формулировки выписываются в Task 4 плана (приказы № 286/287/413+732).
// Сейчас в каждой ячейке — один заглушечный пункт, чтобы тесты структуры проходили
// и зависимый код не падал на пустом массиве. Между Task 2 и Task 4 продакшен не катится.
const PLACEHOLDER = 'TODO: формулировка из ФГОС'

export const CATALOG: Record<Level, Record<CanonicalDirection, string[]>> = {
  NOO: {
    'Гражданское': [PLACEHOLDER],
    'Патриотическое': [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    'Эстетическое': [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    'Трудовое': [PLACEHOLDER],
    'Экологическое': [PLACEHOLDER],
    'Познавательное': [PLACEHOLDER],
  },
  OOO: {
    'Гражданское': [PLACEHOLDER],
    'Патриотическое': [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    'Эстетическое': [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    'Трудовое': [PLACEHOLDER],
    'Экологическое': [PLACEHOLDER],
    'Познавательное': [PLACEHOLDER],
  },
  SOO: {
    'Гражданское': [PLACEHOLDER],
    'Патриотическое': [PLACEHOLDER],
    'Духовно-нравственное': [PLACEHOLDER],
    'Эстетическое': [PLACEHOLDER],
    'Физическое и здоровье': [PLACEHOLDER],
    'Трудовое': [PLACEHOLDER],
    'Экологическое': [PLACEHOLDER],
    'Познавательное': [PLACEHOLDER],
  },
}

export function getCatalog(level: Level, direction: Direction): string[] {
  return CATALOG[level][canonicalDirection(direction)]
}
```

- [ ] **Step 4: Тесты — должны пройти**

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
```

Ожидание: PASS — 5 тестов зелёные. Тест «length > 10» проходит, потому что PLACEHOLDER длиннее 10 символов.

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/personal-results.ts tests/lib/scenario/personal-results.test.ts
git commit -m "feat(scenario): скелет каталога личностных результатов ФГОС

Структура CATALOG[Level][CanonicalDirection]: 3×8=24 ячейки с
placeholder'ом. Реальные формулировки из ФГОС НОО/ООО/СОО
(приказы № 286/287/413+732) добавит Task 4. getCatalog принимает
любое UI-направление и маппит на каноническое через canonicalDirection."
```

---

## Task 3: `validateAgainstCatalog` и `selectPersonalResults`

**Files:**
- Modify: `lib/scenario/personal-results.ts`
- Test: `tests/lib/scenario/personal-results.test.ts` (расширение)

- [ ] **Step 1: Дописать падающие тесты**

В конец `tests/lib/scenario/personal-results.test.ts`:

```ts
import { selectPersonalResults, validateAgainstCatalog } from '@/lib/scenario/personal-results'

describe('validateAgainstCatalog', () => {
  const catalog = ['Формулировка А', 'Формулировка Б', 'Формулировка В']
  it('пропускает только строки из каталога', () => {
    expect(validateAgainstCatalog(['Формулировка А', 'Левая фраза'], catalog)).toEqual([
      'Формулировка А',
    ])
  })
  it('нормализует множественные пробелы', () => {
    expect(validateAgainstCatalog(['  Формулировка   А  '], catalog)).toEqual(['Формулировка А'])
  })
  it('пустой вход → пустой выход', () => {
    expect(validateAgainstCatalog([], catalog)).toEqual([])
  })
})

describe('selectPersonalResults', () => {
  const catalog = ['А', 'Б', 'В', 'Г', 'Д', 'Е']
  it('возвращает валидный вход, если >=3', () => {
    expect(selectPersonalResults(['А', 'Б', 'В'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('обрезает до 5', () => {
    expect(selectPersonalResults(['А', 'Б', 'В', 'Г', 'Д', 'Е'], catalog)).toEqual([
      'А',
      'Б',
      'В',
      'Г',
      'Д',
    ])
  })
  it('добирает из каталога, если валидных <3', () => {
    expect(selectPersonalResults(['А'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('добирает из каталога при undefined/пустом входе', () => {
    expect(selectPersonalResults(undefined, catalog)).toEqual(['А', 'Б', 'В'])
    expect(selectPersonalResults([], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('дедуплицирует валидные', () => {
    expect(selectPersonalResults(['А', 'А', 'Б'], catalog)).toEqual(['А', 'Б', 'В'])
  })
  it('игнорирует невалидные, добирает первыми из каталога', () => {
    expect(selectPersonalResults(['А', 'мусор', 'ещё мусор'], catalog)).toEqual(['А', 'Б', 'В'])
  })
})
```

- [ ] **Step 2: Тесты должны падать**

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
```

Ожидание: FAIL — `validateAgainstCatalog` / `selectPersonalResults` не определены.

- [ ] **Step 3: Дописать `lib/scenario/personal-results.ts`**

В конец файла:

```ts
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function validateAgainstCatalog(items: string[], catalog: string[]): string[] {
  const catalogNormed = new Set(catalog.map(norm))
  return items.map(norm).filter((s) => catalogNormed.has(s))
}

const MIN = 3
const MAX = 5

export function selectPersonalResults(
  items: string[] | undefined,
  catalog: string[],
): string[] {
  const valid = validateAgainstCatalog(items ?? [], catalog)
  const deduped: string[] = []
  for (const s of valid) {
    if (!deduped.includes(s)) deduped.push(s)
  }
  if (deduped.length >= MIN) return deduped.slice(0, MAX)
  const need = MIN - deduped.length
  const fallback = catalog
    .map(norm)
    .filter((s) => !deduped.includes(s))
    .slice(0, need)
  return [...deduped, ...fallback]
}
```

- [ ] **Step 4: Прогнать всё — должно быть зелёным**

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
```

Ожидание: PASS — все тесты файла зелёные (структура + validate + select).

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/personal-results.ts tests/lib/scenario/personal-results.test.ts
git commit -m "feat(scenario): whitelist-валидация и fallback личностных результатов

validateAgainstCatalog нормализует пробелы и пропускает только
строки из каталога. selectPersonalResults: дедуплицирует валидные;
если осталось <3, добирает первыми из каталога до 3; обрезает до 5.
Гарантирует, что в ScenarioContent.personalResults попадает только
дословный текст из ФГОС, минимум 3 формулировки в любом случае."
```

---

## Task 4: Наполнить каталог дословными формулировками ФГОС

**Files:**
- Modify: `lib/scenario/personal-results.ts`
- Test: `tests/lib/scenario/personal-results.test.ts` (без изменений)

> Это **ручная задача по выписке текста из приказов ФГОС**. Имплементер
> открывает PDF приказов и в каждую из 24 ячеек кладёт 5–8 дословных
> формулировок личностных результатов, привязанных к канонической паре
> (уровень, направление). Не сокращать, не перефразировать.

**Источники (нужны имплементеру под рукой):**
- ФГОС НОО — приказ Минпросвещения РФ № 286 от 31.05.2021, **раздел III п. 31**.
- ФГОС ООО — приказ № 287 от 31.05.2021, **раздел III п. 41**.
- ФГОС СОО — приказ № 413 от 17.05.2012, **раздел II «Личностные результаты»**
  (ред. приказа № 732 от 12.08.2022).

Тексты приказов открыты на edsoo.ru, ConsultantPlus, Garant.

**Группировка ФГОС vs наши канонические направления:**

ФГОС часто объединяет «гражданское и патриотическое» в один блок — при выписке расщепляем:
- формулировки про **российскую гражданскую идентичность, готовность к участию в общественной жизни, противодействию экстремизму** → `Гражданское`;
- формулировки про **любовь к Родине, государственные символы, сопричастность к народу, традициям** → `Патриотическое`.

ФГОС-блок «физическое воспитание, формирование культуры здоровья и эмоционального благополучия» → целиком в `Физическое и здоровье`.

Блок «ценность научного познания» → `Познавательное`.

«Духовно-нравственное» и «эстетическое» в ФГОС идут отдельными блоками — берём как есть. «Трудовое» (включая ориентацию на профессиональную деятельность) и «экологическое» — тоже отдельно.

Дублирование одной формулировки в две ячейки допустимо (например, фраза про «уважение к старшим» может идти и в Духовно-нравственное, и в Эстетическое). Не злоупотреблять — дубль допустим, только если фраза действительно общая для двух блоков.

- [ ] **Step 1: Открыть приказы ФГОС**

Можно воспользоваться WebFetch на:
- https://edsoo.ru/wp-content/uploads/2023/08/02_FGOS_NOO_REESTR_5_DOP_1.pdf (НОО)
- https://edsoo.ru/wp-content/uploads/2023/08/02_FGOS_OOO_REESTR_2_DOP_2.pdf (ООО)
- https://edsoo.ru/wp-content/uploads/2023/08/3_FGOS-SOO.pdf (СОО)

Если URL изменились — гуглить «ФГОС НОО приказ 286 личностные результаты pdf».

- [ ] **Step 2: Выписать формулировки в `CATALOG`**

Открыть `lib/scenario/personal-results.ts`. Для КАЖДОЙ из 24 ячеек заменить `[PLACEHOLDER]` на массив из 5–8 дословных формулировок ФГОС. Над каждой ячейкой добавить комментарий-источник:

```ts
NOO: {
  // ФГОС НОО п. 31, гражданско-патриотический блок (часть про гражданскую идентичность)
  'Гражданское': [
    'Сформированность активной гражданской позиции...', // дословная
    'Готовность к участию в общественной жизни...',
    // 5-8 пунктов
  ],
  // ФГОС НОО п. 31, гражданско-патриотический блок (часть про Родину и символы)
  'Патриотическое': [
    'Сформированность чувства любви к Родине...',
    'Уважительное отношение к государственным символам России (герб, флаг, гимн)...',
    // 5-8 пунктов
  ],
  // ...
}
```

И так для всех трёх уровней. Итого 24 ячейки × 5–8 = ~120–192 строки.

- [ ] **Step 3: Прогнать тесты — должны остаться зелёными**

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
```

Ожидание: PASS. Тест «length > 10» автоматически проверит, что нет коротких заглушек.

- [ ] **Step 4: Sanity-check каталога глазами**

```bash
grep -c "TODO: формулировка из ФГОС" lib/scenario/personal-results.ts
```

Ожидание: `0` — все плейсхолдеры заменены.

```bash
pnpm exec tsx -e "
import { CATALOG } from './lib/scenario/personal-results'
for (const lvl of ['NOO','OOO','SOO'] as const) {
  for (const dir of Object.keys(CATALOG[lvl])) {
    const n = CATALOG[lvl][dir as keyof typeof CATALOG.NOO].length
    console.log(\`\${lvl}/\${dir}: \${n} формулировок\`)
  }
}
"
```

Ожидание: для каждой ячейки 5–8 формулировок.

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/personal-results.ts
git commit -m "feat(scenario): дословные формулировки личностных результатов ФГОС

Каталог наполнен из текстов ФГОС НОО (приказ № 286 п. 31),
ФГОС ООО (№ 287 п. 41), ФГОС СОО (№ 413, ред. № 732, раздел II).
24 ячейки × 5-8 формулировок дословно. Каждая ячейка снабжена
комментарием-источником. Гражданско-патриотический блок ФГОС
расщеплён на Гражданское и Патриотическое."
```

---

## Task 5: Расширить схему — `personalResults` и возрастной кап

**Files:**
- Modify: `lib/scenario/schema.ts`
- Test: `tests/lib/scenario/schema.test.ts` (расширение или создание)

- [ ] **Step 1: Написать падающие тесты для капа**

Если файла `tests/lib/scenario/schema.test.ts` нет — создать. Если есть — дописать в конец. Минимум:

```ts
import { describe, expect, it } from 'vitest'
import { generationInputSchema, scenarioContentSchema } from '@/lib/scenario/schema'

describe('generationInputSchema (возрастной кап)', () => {
  const base = {
    direction: 'Патриотическое' as const,
    topic: 'День Победы',
    format: 'беседа' as const,
  }
  it('1 класс, 35 мин → ok', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 1, durationMin: 35 })
    expect(r.success).toBe(true)
  })
  it('1 класс, 45 мин → ошибка', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 1, durationMin: 45 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['durationMin'])
  })
  it('5 класс, 45 мин → ok', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 5, durationMin: 45 })
    expect(r.success).toBe(true)
  })
  it('5 класс, 60 мин → ошибка', () => {
    const r = generationInputSchema.safeParse({ ...base, grade: 5, durationMin: 60 })
    expect(r.success).toBe(false)
  })
  it('11 класс, 45 мин → ok; 11 класс, 60 → ошибка', () => {
    expect(
      generationInputSchema.safeParse({ ...base, grade: 11, durationMin: 45 }).success,
    ).toBe(true)
    expect(
      generationInputSchema.safeParse({ ...base, grade: 11, durationMin: 60 }).success,
    ).toBe(false)
  })
})

describe('scenarioContentSchema (personalResults optional)', () => {
  const minimal = {
    title: 'T',
    goals: ['g'],
    materials: [],
    stages: [
      {
        kind: 'engage' as const,
        title: 'e',
        duration_min: 5,
        activities: [{ type: 'discussion' as const, text: 'x' }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }
  it('валиден без personalResults (совместимость со старыми сценариями)', () => {
    expect(scenarioContentSchema.safeParse(minimal).success).toBe(true)
  })
  it('валиден с personalResults', () => {
    expect(
      scenarioContentSchema.safeParse({ ...minimal, personalResults: ['А', 'Б', 'В'] }).success,
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Тесты должны падать**

```bash
pnpm exec vitest run tests/lib/scenario/schema.test.ts
```

Ожидание: FAIL — кап не реализован; новый `personalResults` ещё не объявлен в схеме.

- [ ] **Step 3: Модифицировать `lib/scenario/schema.ts`**

Добавить `personalResults` в `scenarioContentSchema`:

```ts
export const scenarioContentSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(),
  coreMeanings: z.array(z.string()).optional(),
  personalResults: z.array(z.string().min(1)).max(8).optional(),
  materials: z.array(z.string()),
  stages: z.array(stageSchema).min(1),
  adaptations: z.object({
    simpler: z.string().min(1),
    harder: z.string().min(1),
  }),
})
```

Добавить `personalResults` в `skeletonSchema`:

```ts
export const skeletonSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(),
  coreMeanings: z.array(z.string()).optional(),
  personalResults: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  adaptations: z.object({ simpler: z.string(), harder: z.string() }).partial().optional(),
  stages: z.array(skeletonStageSchema).min(1),
})
```

Добавить импорт и кап в `generationInputSchema`. Использовать `formatGrade` из `options.ts` для сообщения:

```ts
import { DIRECTIONS, FORMATS, SPO_GRADE, formatGrade } from './options'

export const generationInputSchema = z
  .object({
    direction: z.enum(DIRECTIONS),
    grade: z.coerce.number().int().min(1).max(SPO_GRADE),
    topic: z.string().trim().min(1, 'Укажите тему').max(200),
    durationMin: z.coerce.number().int().min(5).max(120),
    format: z.enum(FORMATS),
    userMaterial: z.string().max(20_000).optional(),
  })
  .superRefine((data, ctx) => {
    const cap = data.grade === 1 ? 35 : 45
    if (data.durationMin > cap) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMin'],
        message:
          data.grade === 1
            ? 'Для 1 класса длительность занятия не более 35 мин (СанПиН).'
            : `Для ${formatGrade(data.grade)} длительность занятия не более 45 мин (СанПиН).`,
      })
    }
  })
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

```bash
pnpm exec vitest run tests/lib/scenario/schema.test.ts
```

Ожидание: PASS. Запустить весь набор:

```bash
pnpm exec vitest run
```

Ожидание: все ранее зелёные тесты остаются зелёными.

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/schema.ts tests/lib/scenario/schema.test.ts
git commit -m "feat(scenario): personalResults в схеме + возрастной кап длительности

ScenarioContent и skeleton получают optional personalResults
(совместимость со старыми сценариями в БД). generationInputSchema
через superRefine блокирует durationMin > 35 для 1 класса и > 45
для 2-11 классов и СПО (СанПиН 1.2.3685-21). Ловится на сервере
во всех путях (стрим, server actions, прямой POST)."
```

---

## Task 6: Промпт — секция `[PERSONAL_RESULTS_CATALOG]`

**Files:**
- Modify: `lib/scenario/prompt.ts`

> Юнит-тест на текст промпта смысла не имеет (это шаблон). Проверка —
> через ручной запуск сборки и существующие тесты на структуру skeleton
> (они импортируют функцию и проверят отсутствие синтаксических ошибок).

- [ ] **Step 1: Дополнить `buildSkeletonMessages`**

В `lib/scenario/prompt.ts`:

1. Импорты в начало файла:

```ts
import { gradeToLevel, levelLabel } from './levels'
import { getCatalog } from './personal-results'
```

2. Обновить `PROMPT_VERSION`:

```ts
export const PROMPT_VERSION = 'v9-personal-results-2026-05-30'
```

3. В `buildSkeletonMessages`, после блока `examples` (перед `user`), добавить:

```ts
const personalResultsCatalog = getCatalog(gradeToLevel(input.grade), input.direction)
const personalResultsBlock = [
  '',
  `[PERSONAL_RESULTS_CATALOG] (личностные результаты из ФГОС ${levelLabel(gradeToLevel(input.grade))}, направление «${input.direction}»):`,
  ...personalResultsCatalog.map((f, i) => `${i + 1}. ${f}`),
  '',
  'Выбери 3-5 формулировок из списка выше, наиболее релевантных теме «' +
    input.topic +
    '».',
  'Верни их ДОСЛОВНО, без правок и сокращений, в массиве "personalResults" каркаса.',
  'Не придумывай свои формулировки — только из этого списка.',
]
```

4. Обновить `SKELETON_SCHEMA_HINT` — добавить `personalResults` после `coreMeanings`:

```ts
"personalResults": string[],   // 3-5 ДОСЛОВНЫХ формулировок из [PERSONAL_RESULTS_CATALOG]
```

(вставить в схему в нужное место в шаблонной строке `SKELETON_SCHEMA_HINT`)

5. Включить `personalResultsBlock` в `user`:

```ts
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
].join('\n')
```

- [ ] **Step 2: Запустить тесты — ничего не должно сломаться**

```bash
pnpm exec vitest run
```

Ожидание: всё зелёное. Если есть тесты, которые снапшотят skeleton-промпт — обновить снапшоты:

```bash
pnpm exec vitest run -u
```

- [ ] **Step 3: Sanity-check сборки**

```bash
pnpm exec tsc --noEmit
```

Ожидание: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add lib/scenario/prompt.ts
git commit -m "feat(prompt): секция [PERSONAL_RESULTS_CATALOG] в skeleton

Каталог личностных результатов ФГОС для пары (уровень, направление)
вкладывается в skeleton-промпт; LLM выбирает 3-5 формулировок
дословно и кладёт в \"personalResults\". Whitelist-валидация на
выходе — в Task 7. PROMPT_VERSION → v9-personal-results-2026-05-30."
```

---

## Task 7: Whitelist-валидация в `stream.ts`

**Files:**
- Modify: `lib/scenario/stream.ts`
- Test: `tests/lib/scenario/stream.test.ts` (расширение)

> `stream.ts` тяжело тестировать целиком (зовёт LLM). Но `selectPersonalResults`
> уже покрыт юнит-тестами в Task 3. Здесь добавим один интеграционный тест,
> который инжектирует мок-chat и проверяет, что итоговый сценарий получает
> валидные `personalResults`.

- [ ] **Step 1: Найти существующий стиль мок-теста стрима**

```bash
grep -n "streamScenario\|deps\.\|MockChat\|stream\.test" tests/lib/scenario/stream.test.ts | head -20
```

Если уже есть мок-`chat` — переиспользовать паттерн. Если файла нет — спросить себя: «как сейчас покрыт stream?» (см. `tests/`). В крайнем случае — пропустить тест и пройти ручным UAT в Task 13. **Если интеграционный тест занимает >15 минут на склейку — переходим к Step 3, делаем код без теста и фиксируем долг.**

- [ ] **Step 2: Добавить тест (если паттерн моков есть)**

Тест должен:
1. Замокать `chat` так, чтобы skeleton-ответ содержал `personalResults: ['Левая фраза']` (или вообще не содержал).
2. Замокать `chat` для блоков любым валидным минимальным JSON.
3. Прогнать `streamScenario` с инжектированным `save` (просто `async () => 'id-1'`).
4. Проверить, что в переданном `save` `content.personalResults` — массив из ≥3 строк, и каждая — из каталога `getCatalog(gradeToLevel(grade), direction)`.

- [ ] **Step 3: Модифицировать `lib/scenario/stream.ts`**

В импортах:

```ts
import { gradeToLevel } from './levels'
import { getCatalog, selectPersonalResults } from './personal-results'
```

После строки `if (!skeleton) throw new Error('Невалидный каркас сценария')` (≈ строка 186):

```ts
// Whitelist: личностные результаты только из каталога ФГОС.
// Если LLM вернула невалидное/пустое — добираем первыми из каталога.
const prCatalog = getCatalog(gradeToLevel(input.grade), input.direction)
skeleton.personalResults = selectPersonalResults(skeleton.personalResults, prCatalog)
```

В сборке `assembled` (≈ строка 231) добавить `personalResults`:

```ts
const assembled = {
  title: skeleton.title,
  goals: skeleton.goals,
  values: skeleton.values,
  coreMeanings: skeleton.coreMeanings,
  personalResults: skeleton.personalResults,
  materials: skeleton.materials ?? [],
  // ...
}
```

- [ ] **Step 4: Прогнать тесты**

```bash
pnpm exec vitest run
```

Ожидание: всё зелёное, включая новый интеграционный тест (если он был добавлен).

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/stream.ts tests/lib/scenario/stream.test.ts
git commit -m "feat(stream): whitelist-валидация personalResults после skeleton

После parseSkeleton прогоняем personalResults через
selectPersonalResults(catalog). Гарантия: в БД попадают только
дословные формулировки ФГОС, минимум 3 даже если LLM ничего
валидного не вернула."
```

---

## Task 8: Warning'и про рефлексию в `quality.ts`

**Files:**
- Modify: `lib/scenario/quality.ts`
- Test: `tests/lib/scenario/quality.test.ts` (расширение)

- [ ] **Step 1: Дописать падающие тесты**

В `tests/lib/scenario/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { checkScenario } from '@/lib/scenario/quality'
import type { ScenarioContent } from '@/lib/scenario/schema'

const padText = (n: number) => 'a'.repeat(n)

function withStages(stages: ScenarioContent['stages']): ScenarioContent {
  return {
    title: 'T',
    goals: ['g'],
    materials: [],
    stages,
    adaptations: { simpler: 's', harder: 'h' },
  }
}

describe('checkScenario — рефлексия', () => {
  it('warning, когда нет этапа рефлексии', () => {
    const content = withStages([
      {
        kind: 'engage',
        title: 'Вовлечение',
        duration_min: 5,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Что важно?'] }],
      },
      {
        kind: 'main',
        title: 'Основная',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['А что если?'] }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('нет этапа рефлексии'))).toBe(true)
  })

  it('warning, когда рефлексия есть, но без вопросов', () => {
    const content = withStages([
      {
        kind: 'main',
        title: 'M',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Q1'] }],
      },
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [{ type: 'task', text: 'Раздать карточки.' }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(true)
  })

  it('нет warning, когда рефлексия с вопросами в questions', () => {
    const content = withStages([
      {
        kind: 'main',
        title: 'M',
        duration_min: 20,
        activities: [{ type: 'discussion', text: padText(700), questions: ['Q'] }],
      },
      {
        kind: 'reflection',
        title: 'Рефлексия',
        duration_min: 5,
        activities: [
          {
            type: 'discussion',
            text: padText(700),
            questions: ['Что для тебя было важно?'],
          },
        ],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии'))).toBe(false)
  })

  it('нет warning, когда вопрос вшит в text активности (содержит ?)', () => {
    const content = withStages([
      {
        kind: 'reflection',
        title: 'Р',
        duration_min: 5,
        activities: [{ type: 'task', text: 'Учитель: что вы возьмёте с собой?' }],
      },
    ])
    const { warnings } = checkScenario(content)
    expect(warnings.some((w) => w.includes('рефлексии нет вопросов'))).toBe(false)
  })
})
```

- [ ] **Step 2: Тесты должны падать**

```bash
pnpm exec vitest run tests/lib/scenario/quality.test.ts
```

Ожидание: новые 4 теста FAIL; старые остаются как были.

- [ ] **Step 3: Расширить `checkScenario` в `lib/scenario/quality.ts`**

В конец функции `checkScenario`, перед `return`:

```ts
const reflectionStages = content.stages.filter((s) => s.kind === 'reflection')
if (reflectionStages.length === 0) {
  warnings.push('В сценарии нет этапа рефлексии (заключительная часть)')
}
for (const stage of reflectionStages) {
  const hasQuestions = stage.activities.some(
    (a) => (a.questions?.length ?? 0) > 0 || a.text.includes('?'),
  )
  if (!hasQuestions) {
    warnings.push('В этапе рефлексии нет вопросов для обратной связи')
  }
}
```

- [ ] **Step 4: Тесты — должны пройти**

```bash
pnpm exec vitest run tests/lib/scenario/quality.test.ts
```

Ожидание: PASS. Прогнать весь набор:

```bash
pnpm exec vitest run
```

- [ ] **Step 5: Коммит**

```bash
git add lib/scenario/quality.ts tests/lib/scenario/quality.test.ts
git commit -m "feat(quality): warning'и про отсутствие рефлексии

checkScenario выдаёт два неблокирующих warning'а: «нет этапа
рефлексии» и «в этапе рефлексии нет вопросов для обратной связи»
(вопросы детектятся в questions или по '?' в text). Попадают в
meta.qualityWarnings и в существующий неблокирующий баннер редактора."
```

---

## Task 9: Методическая шапка экспорта + блок личностных результатов

**Files:**
- Modify: `lib/export/document-model.ts`
- Test: `tests/lib/export/document-model.test.ts` (расширение)

- [ ] **Step 1: Написать падающие тесты**

В `tests/lib/export/document-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildScenarioDocument } from '@/lib/export/document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'

const baseContent: ScenarioContent = {
  title: 'День Победы',
  goals: ['Сформировать уважение к подвигу', 'Развить понимание исторической памяти'],
  values: ['память', 'долг'],
  materials: ['презентация', 'видео'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'x' }],
    },
  ],
  adaptations: { simpler: 's', harder: 'h' },
}

const baseMeta = {
  topic: 'День Победы',
  direction: 'Патриотическое',
  grade: 6,
  durationMin: 30,
  format: 'беседа',
}

describe('buildScenarioDocument — методическая шапка', () => {
  it('шапка содержит класс с уровнем образования в скобках', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    expect(meta).toBeDefined()
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const audience = meta.rows.find((r) => r.label === 'Класс / уровень')
    expect(audience?.value).toMatch(/ООО/)
    expect(audience?.value).toMatch(/6 класс/)
  })

  it('шапка содержит цель занятия (первую из goals)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const goal = meta.rows.find((r) => r.label === 'Цель занятия')
    expect(goal?.value).toContain('Сформировать уважение к подвигу')
    expect(goal?.value).toContain('и др.')
  })

  it('шапка содержит формируемые ценности (если есть)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const values = meta.rows.find((r) => r.label === 'Формируемые ценности')
    expect(values?.value).toBe('память, долг')
  })

  it('шапка содержит оборудование (materials)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const eq = meta.rows.find((r) => r.label === 'Оборудование')
    expect(eq?.value).toBe('презентация, видео')
  })
})

describe('buildScenarioDocument — блок личностных результатов', () => {
  it('рендерится, если personalResults непустой', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, personalResults: ['результат А', 'результат Б', 'результат В'] },
      baseMeta,
    )
    const idx = doc.findIndex(
      (b) => b.type === 'heading' && b.text === 'Планируемые личностные результаты',
    )
    expect(idx).toBeGreaterThan(-1)
    const next = doc[idx + 1]
    expect(next.type).toBe('bullets')
    if (next.type === 'bullets') {
      expect(next.items).toEqual(['результат А', 'результат Б', 'результат В'])
    }
  })

  it('не рендерится, если personalResults пустой или отсутствует', () => {
    const doc1 = buildScenarioDocument(baseContent, baseMeta)
    const doc2 = buildScenarioDocument({ ...baseContent, personalResults: [] }, baseMeta)
    for (const doc of [doc1, doc2]) {
      expect(
        doc.some((b) => b.type === 'heading' && b.text === 'Планируемые личностные результаты'),
      ).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Тесты должны падать**

```bash
pnpm exec vitest run tests/lib/export/document-model.test.ts
```

Ожидание: FAIL.

- [ ] **Step 3: Расширить `lib/export/document-model.ts`**

1. Добавить импорты:

```ts
import { gradeToLevel, levelLabel } from '@/lib/scenario/levels'
```

2. Заменить блок `metaTable` (строки 30–39) на расширенный:

```ts
const audience = `${formatGrade(meta.grade)} (${levelLabel(gradeToLevel(meta.grade))})`
const goalValue =
  content.goals.length > 0
    ? content.goals[0] + (content.goals.length > 1 ? ' (и др.)' : '')
    : '—'
const metaRows = [
  { label: 'Тема', value: meta.topic || '—' },
  { label: 'Направление воспитания', value: meta.direction },
  { label: 'Класс / уровень', value: audience },
  { label: 'Длительность', value: `${meta.durationMin} мин` },
  { label: 'Формат', value: meta.format },
  { label: 'Цель занятия', value: goalValue },
]
if (content.values && content.values.length > 0) {
  metaRows.push({ label: 'Формируемые ценности', value: content.values.join(', ') })
}
if (content.materials.length > 0) {
  metaRows.push({ label: 'Оборудование', value: content.materials.join(', ') })
}
blocks.push({ type: 'metaTable', rows: metaRows })
```

3. После блока «Основные смыслы» (≈ строка 52) и ДО цикла этапов добавить:

```ts
if (content.personalResults && content.personalResults.length > 0) {
  blocks.push({ type: 'heading', level: 2, text: 'Планируемые личностные результаты' })
  blocks.push({ type: 'bullets', items: content.personalResults })
}
```

4. Удалить дублирующий блок «Материалы» (строки 74–77 в текущем файле) — он теперь покрыт строкой «Оборудование» в шапке. Если в команде или в UI это считается регрессом — оставить и пометить дублирование в коммит-сообщении.

   **Решение:** удалить. «Материалы» в самом тексте сценария — то же, что «оборудование» в шапке; дублировать не нужно.

- [ ] **Step 4: Тесты — должны пройти**

```bash
pnpm exec vitest run tests/lib/export/document-model.test.ts
pnpm exec vitest run
```

Ожидание: PASS.

- [ ] **Step 5: Коммит**

```bash
git add lib/export/document-model.ts tests/lib/export/document-model.test.ts
git commit -m "feat(export): методическая шапка ФГОС + блок личностных результатов

metaTable расширен до 6+ строк (тема, направление, класс+уровень,
длительность, формат, цель; опционально ценности, оборудование).
Блок «Планируемые личностные результаты» рендерится перед ходом
занятия, если массив непустой. Старые сценарии без поля и пустые
materials корректно обрабатываются. Дублирующая секция «Материалы»
в теле документа удалена — данные теперь в шапке."
```

---

## Task 10: Карточка личностных результатов в редакторе

**Files:**
- Modify: `components/scenario/editor.tsx`

> UI-склейка без юнит-тестов (по конвенции CLAUDE.md). Проверка — гейтами
> `tsc/lint/build` и финальным ручным UAT в Task 13.

- [ ] **Step 1: Сориентироваться в структуре редактора**

```bash
grep -n "goals\|materials\|values\|coreMeanings\|<Card" components/scenario/editor.tsx | head -40
```

Найти карточку с целями (`goals`) — она будет паттерном для новой карточки.

- [ ] **Step 2: Добавить импорт уровня**

В шапку `components/scenario/editor.tsx`:

```ts
import { gradeToLevel, levelLabel } from '@/lib/scenario/levels'
```

Прокинуть `direction` и `grade` в редактор, если ещё не проброшены (они есть в `meta` соседнего файла `page.tsx` — посмотреть пропсы редактора и добавить в `Meta` тип, если нужно). Если уже прокинуты — skip.

- [ ] **Step 3: Добавить state и хелперы**

Где состоит локальный `content`-state (рядом с `goals`/`materials`):

```ts
// helpers по аналогии с goals
function updatePersonalResult(idx: number, value: string) {
  setContent((c) => ({
    ...c,
    personalResults: (c.personalResults ?? []).map((x, i) => (i === idx ? value : x)),
  }))
}
function addPersonalResult() {
  setContent((c) => ({
    ...c,
    personalResults: [...(c.personalResults ?? []), ''],
  }))
}
function removePersonalResult(idx: number) {
  setContent((c) => ({
    ...c,
    personalResults: (c.personalResults ?? []).filter((_, i) => i !== idx),
  }))
}
```

Если в редакторе используется `useReducer` или иной паттерн — адаптировать, переиспользуя стиль соседних хелперов для `goals`.

- [ ] **Step 4: Добавить карточку в JSX**

Между карточками «Цели» и «Материалы» (порядок: title → goals → personalResults → materials):

```tsx
<Card>
  <CardHeader>
    <CardTitle>Планируемые личностные результаты</CardTitle>
    <p className="text-sm text-neutral-500">
      Из ФГОС {levelLabel(gradeToLevel(meta.grade))}, направление «{meta.direction}»
    </p>
  </CardHeader>
  <CardContent className="space-y-2">
    {(content.personalResults ?? []).map((r, i) => (
      <div key={i} className="flex gap-2">
        <Textarea
          value={r}
          onChange={(e) => updatePersonalResult(i, e.target.value)}
          rows={2}
          className="flex-1"
        />
        <Button type="button" variant="ghost" onClick={() => removePersonalResult(i)}>
          ×
        </Button>
      </div>
    ))}
    <Button type="button" variant="outline" onClick={addPersonalResult}>
      + Добавить
    </Button>
  </CardContent>
</Card>
```

(Точный путь импорта `Textarea` — `@/components/ui/textarea`, см. соседние карточки.)

- [ ] **Step 5: Гейты**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check components/scenario/editor.tsx
pnpm build
```

Ожидание: 0 ошибок.

- [ ] **Step 6: Коммит**

```bash
git add components/scenario/editor.tsx
git commit -m "feat(editor): карточка «Планируемые личностные результаты»

Между целями и материалами. Подсказка с уровнем (НОО/ООО/СОО) и
направлением. Редактирование, добавление и удаление пунктов руками
(по аналогии с goals). На save идёт обычный saveScenarioAction —
whitelist на сохранении не применяется (учителю можно править под
свой класс; whitelist — только на выходе LLM)."
```

---

## Task 11: Рендер блока на read-only странице share

**Files:**
- Modify: `components/share/ScenarioReadOnly.tsx`

- [ ] **Step 1: Найти место для рендера**

```bash
grep -n "goals\|materials\|coreMeanings\|values" components/share/ScenarioReadOnly.tsx | head -20
```

Найти место, где рендерятся `values` / `coreMeanings` (если они там есть). Если read-only использует `buildScenarioDocument` целиком — Task 9 уже всё покрыл и здесь делать нечего.

- [ ] **Step 2: Решение зависит от реализации**

Если файл рендерит через `buildScenarioDocument` (как PDF/DOCX) — **skip всю задачу**, написать в коммит-месседже, что Task 9 уже покрыл share-страницу.

Если файл рендерит вручную (свой JSX) — добавить блок аналогично:

```tsx
{content.personalResults && content.personalResults.length > 0 && (
  <section>
    <h2>Планируемые личностные результаты</h2>
    <ul>
      {content.personalResults.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  </section>
)}
```

В стиле существующих секций файла.

- [ ] **Step 3: Гейты**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Коммит (если были изменения)**

```bash
git add components/share/ScenarioReadOnly.tsx
git commit -m "feat(share): блок личностных результатов на публичной странице

Read-only рендер massива personalResults после блока «Основные
смыслы». Совместимо со старыми сценариями (блок скрыт, если пусто).

[ИЛИ — если рендер через buildScenarioDocument:]
chore(share): подтвердить, что Task 9 покрыл share-страницу
(рендер делегирован buildScenarioDocument)."
```

---

## Task 12: Фильтр опций длительности на форме `/app/new`

**Files:**
- Modify: `app/app/new/page.tsx`

- [ ] **Step 1: Найти текущий `<select name="durationMin">`**

Уже видно — `app/app/new/page.tsx:122-136`. Сам select рендерит `DURATIONS.map(...)`. Класс выбирается соседним `<select name="grade">`.

- [ ] **Step 2: Перевести `durationMin` в управляемый select с фильтром**

В `NewScenarioForm` (это уже client-компонент):

1. Добавить state:

```ts
const [grade, setGrade] = useState(5)
const [durationMin, setDurationMin] = useState(30)
```

Если эти значения уже где-то живут в state — переиспользовать. Если нет — добавить.

2. У `<select name="grade">` добавить `value={grade}` и `onChange={(e) => { const g = Number(e.target.value); setGrade(g); const cap = g === 1 ? 35 : 45; if (durationMin > cap) setDurationMin(Math.min(durationMin, cap)) }}`.

3. У `<select name="durationMin">` фильтровать опции:

```tsx
{DURATIONS.filter((d) => d <= (grade === 1 ? 35 : 45)).map((d) => (
  <option key={d} value={d}>
    {d} минут
  </option>
))}
```

И сделать select управляемым: `value={durationMin}` + `onChange={(e) => setDurationMin(Number(e.target.value))}`.

Дефолт `defaultValue="30"` убрать (заменён на `value`).

- [ ] **Step 3: Гейты**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check app/app/new/page.tsx
pnpm build
```

- [ ] **Step 4: Sanity-check вручную**

Запустить dev:

```bash
pnpm dev
```

Открыть `/app/new`, переключить класс на 1 → в списке длительности остаются только 20/30. Переключить обратно на 5 → опции 20/30/40/60 вернулись.

- [ ] **Step 5: Коммит**

```bash
git add app/app/new/page.tsx
git commit -m "feat(new): фильтр опций длительности по выбранному классу

1 класс → доступны только опции ≤ 35 мин (20/30); 2-11 и СПО →
все до 45 мин (60-минутная опция исчезает). Если уже выбрано
больше капа — автоматически снижаем до капа. Серверный
superRefine в generationInputSchema продолжает страховать."
```

---

## Task 13: Changelog + финальные гейты + ручной UAT

**Files:**
- Modify: `lib/changelog.ts`

- [ ] **Step 1: Добавить запись v1.10.0**

В начало массива `CHANGELOG` в `lib/changelog.ts`:

```ts
{
  version: 'v1.10.0',
  date: '2026-05-30',
  changes: [
    {
      kind: 'feature',
      text: 'Сценарий теперь содержит блок «Планируемые личностные результаты» — 3-5 дословных формулировок из ФГОС НОО/ООО/СОО, привязанных к направлению воспитания.',
    },
    {
      kind: 'feature',
      text: 'PDF/DOCX-экспорт открывается с методической шапкой: тема, направление, класс+уровень образования, цель, формируемые ценности, оборудование.',
    },
    {
      kind: 'feature',
      text: 'Возрастной потолок длительности занятия по СанПиН: 1 класс — не более 35 мин, 2-11 классы и СПО — не более 45 мин.',
    },
    {
      kind: 'improvement',
      text: 'Сценарий помечается предупреждением, если в нём нет этапа рефлексии или в рефлексии нет вопросов для обратной связи.',
    },
  ],
},
```

(Точные поля типа `ChangelogEntry` — посмотреть в начале `lib/changelog.ts`.)

- [ ] **Step 2: Прогнать все гейты**

```bash
pnpm exec vitest run
pnpm exec tsc --noEmit
pnpm exec biome check .
pnpm build
```

Ожидание: всё зелёное. Все маршруты, включая `/api/generate/stream`, `/app/scenarios/[id]`, `/s/[token]`, `/changelog`, присутствуют в выводе.

- [ ] **Step 3: Ручной UAT (живой GigaChat, dev-БД)**

Запустить `pnpm dev`. Прогнать 4 сценария:

1. **Создание нового.** `/app/new`, 6 класс, Патриотическое, «День народного единства», 30 мин → дождаться стрима → открыть сценарий → проверить:
   - В редакторе появилась карточка «Планируемые личностные результаты» (3–5 пунктов).
   - Кнопка экспорта PDF → в шапке «6 класс (ООО)», блок «Планируемые личностные результаты» перед ходом занятия.
   - DOCX — то же самое.

2. **Старый сценарий.** Открыть любой ранее созданный сценарий (без `personalResults`) → редактор открывается, карточка пуста; экспорт не падает, шапка показывает «—» для отсутствующих полей.

3. **Возрастной кап.** На `/app/new` выбрать 1 класс → в списке длительности нет 45/60. Через curl:
   ```bash
   curl -X POST http://localhost:3000/api/generate/stream -H 'cookie: <session>' \
     -d '{"direction":"Патриотическое","grade":1,"durationMin":45,"topic":"x","format":"беседа"}'
   ```
   Ожидание: 400 с сообщением про 1 класс и 35 мин.

4. **Warning рефлексии.** В редакторе старого сценария удалить этап с `kind:'reflection'` → сохранить → в баннере появляется warning «В сценарии нет этапа рефлексии». Не блокирует сохранение.

- [ ] **Step 4: Коммит changelog**

```bash
git add lib/changelog.ts
git commit -m "docs(changelog): v1.10.0 — соответствие сценариев ФГОС/ФОП

Личностные результаты в сценарии, методическая шапка экспорта,
возрастной кап длительности по СанПиН, проверка рефлексии."
```

- [ ] **Step 5: Финальная сборка и пуш ветки**

```bash
git log --oneline master..HEAD
pnpm build
```

Ожидание: ~13 коммитов (по одному на задачу). Ветка готова к code-review через `superpowers:requesting-code-review` или прямому мержу через `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

- **Спека покрыта:** §1 цели → задачи 1–12; §2 NOT входит → не реализовано (P3, backfill, регенерация PR); §3 архитектура → файлы соответствуют; §4 каталог → задача 4; §5 промпт → задача 6; §6 whitelist → задачи 3+7; §7 кап → задача 5+12; §8 рефлексия → задача 8; §9 шапка → задача 9; §10 совместимость — поле `optional`, шапка с «—»; §11 тесты → задачи 1, 2, 3, 5, 7, 8, 9; §12 гейты + UAT → задача 13.
- **Без миграций.** В плане их и нет.
- **Type-consistency:** `gradeToLevel`/`canonicalDirection`/`getCatalog`/`selectPersonalResults`/`personalResults` называются одинаково во всех задачах.
- **Placeholder-каталог в Task 2** намеренный — между Task 2 и Task 4 продакшен не катится; это явно зафиксировано в коммите Task 2 и в шапке Task 2.
- **Тесты на UI/server-actions** отсутствуют — это согласовано в §11 спеки. Покрытие — `tsc/lint/build` + ручной UAT в Task 13.
- **Деплой/миграции/секреты** — после мержа, см. конвенции CLAUDE.md (`git pull && docker compose up -d --build`; миграций нет).
