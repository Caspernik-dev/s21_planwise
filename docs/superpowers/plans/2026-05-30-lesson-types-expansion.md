# Расширение типов занятий — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить 5 типов занятий (`rov`/`krujok`/`literacy`/`subject_extension`/`event`) в `/app/new`, разнести промпты по типам, адаптировать валидаторы, библиотеку и экспорт под тип — без регрессий для существующих РоВ-сценариев.

**Architecture:** Колонка `lesson_type` на `scenarios`/`shared_scenarios`/`rag_documents` (default `'rov'`, backfill старого). Промпты разнесены в `lib/scenario/prompts/{shared,rov,krujok,literacy,subject,event,index}.ts` с диспетчером по типу. Новые опц. поля в `ScenarioContent` (`metaResults`, `subjectResults`, `subject`, `literacyKind`). Pre-match — hard-фильтр по типу, библиотека — soft-фильтр.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Postgres+pgvector, zod, Vitest, GigaChat API. Биome для lint.

**Спека:** `docs/superpowers/specs/2026-05-30-lesson-types-expansion-design.md` — авторитетный источник. Когда план говорит «согласно §X» — читай эту секцию.

---

## Конвенции для исполнителя

- **Один коммит на задачу.** В конце каждой задачи: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec biome check <изменённые файлы>`, **только если зелёные — `git add` + `git commit`**.
- **TDD** для всех задач с пометкой `(TDD)`. Сначала тест, который падает, потом минимальный код.
- **DRY/YAGNI.** Не добавлять то, что не в плане. Не рефакторить смежный код.
- **Backwards compat.** Существующие РоВ-сценарии должны открываться, экспортироваться, лайкаться без падений. Это инвариант для каждой задачи.
- **Изоляция по `user_id`** — для любых новых SQL: фильтр по userId на load И write.

---

## Task 1: Миграция 0014 — lesson_type на 3 таблицы

**Files:**
- Create: `db/migrations/0014_lesson_types.sql`
- Modify: `db/migrations/meta/_journal.json` (Drizzle добавит автоматически через `pnpm db:generate`, но если ты вручную пишешь SQL — добавь запись)
- Modify: `db/schema.ts` (добавить `lessonType` колонки в `scenarios`, `sharedScenarios`, `ragDocuments`)

### Шаги

- [ ] **1.1.** Открыть `db/schema.ts`, найти `export const scenarios = pgTable(...)`, `sharedScenarios`, `ragDocuments`. Добавить колонку в каждую:

```ts
// в scenarios
lessonType: text('lesson_type').notNull().default('rov'),

// в sharedScenarios
lessonType: text('lesson_type').notNull().default('rov'),

// в ragDocuments
lessonType: text('lesson_type'),  // nullable
```

- [ ] **1.2.** Сгенерировать SQL:

```bash
pnpm db:generate
```

Ожидание: создаётся `db/migrations/0014_<name>.sql` с тремя `ALTER TABLE ... ADD COLUMN`. Переименовать файл в `0014_lesson_types.sql`, обновить запись в `meta/_journal.json` если нужно.

- [ ] **1.3.** Открыть сгенерированный SQL и добавить check-constraints + индекс **руками** (Drizzle их не вытаскивает):

```sql
-- В конец 0014_lesson_types.sql:
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_lesson_type_check"
  CHECK ("lesson_type" IN ('rov','krujok','literacy','subject_extension','event'));

ALTER TABLE "shared_scenarios" ADD CONSTRAINT "shared_scenarios_lesson_type_check"
  CHECK ("lesson_type" IN ('rov','krujok','literacy','subject_extension','event'));

CREATE INDEX "shared_scenarios_lesson_type_idx" ON "shared_scenarios" ("lesson_type");
```

- [ ] **1.4.** Применить миграцию к dev-БД:

```bash
pnpm db:migrate
```

Ожидание: миграция применяется без ошибок; колонки добавлены, существующие записи получают `'rov'` через DEFAULT.

- [ ] **1.5.** Смоук: `pnpm exec tsc --noEmit` (типы Drizzle подхватились).

- [ ] **1.6.** Commit:

```bash
git add db/migrations/0014_lesson_types.sql db/migrations/meta db/schema.ts
git commit -m "feat(db): миграция 0014 — lesson_type на scenarios/shared_scenarios/rag_documents"
```

---

## Task 2: LESSON_TYPES + расширение DIRECTIONS/FORMATS/DURATIONS

**Files:**
- Modify: `lib/scenario/options.ts`
- Test: `tests/lib/scenario/options.test.ts` (если есть — обновить; иначе пропустить)

### Шаги

- [ ] **2.1.** Добавить в `lib/scenario/options.ts` **после** существующих экспортов:

```ts
export const LESSON_TYPES = [
  {
    value: 'rov' as const,
    label: 'Разговоры о важном',
    description: 'Федеральный курс, понедельник 1-й урок. Трёхчастная структура с видеовходом.',
    icon: 'flag' as const,
    federal: true,
  },
  {
    value: 'krujok' as const,
    label: 'Тематический кружок',
    description: 'Занятие по интересам: робототехника, театр, шахматы. Свободная форма.',
    icon: 'sparkles' as const,
    federal: false,
  },
  {
    value: 'literacy' as const,
    label: 'Функциональная грамотность',
    description: 'Жизненный кейс → разбор → перенос. Читательская/математическая/финансовая/естественнонаучная.',
    icon: 'brain' as const,
    federal: false,
  },
  {
    value: 'subject_extension' as const,
    label: 'Предметное углубление',
    description: 'Опыт, проект, лаборатория поверх школьного предмета.',
    icon: 'flask-conical' as const,
    federal: false,
  },
  {
    value: 'event' as const,
    label: 'Воспитательное мероприятие',
    description: 'Тематический классный час, праздник, КТД, тематический день.',
    icon: 'party-popper' as const,
    federal: false,
  },
] as const

export type LessonType = (typeof LESSON_TYPES)[number]['value']

export const LESSON_TYPE_VALUES: readonly LessonType[] = LESSON_TYPES.map((t) => t.value)

export function lessonTypeLabel(value: LessonType): string {
  return LESSON_TYPES.find((t) => t.value === value)?.label ?? value
}

export const LITERACY_KINDS = [
  { value: 'reading' as const, label: 'Читательская грамотность' },
  { value: 'math' as const, label: 'Математическая грамотность' },
  { value: 'financial' as const, label: 'Финансовая грамотность' },
  { value: 'science' as const, label: 'Естественнонаучная грамотность' },
] as const

export type LiteracyKind = (typeof LITERACY_KINDS)[number]['value']

export function literacyKindLabel(value: LiteracyKind): string {
  return LITERACY_KINDS.find((k) => k.value === value)?.label ?? value
}
```

- [ ] **2.2.** Расширить `DIRECTIONS` — добавить 9-е направление **до** «Семейные ценности» (чтобы 8 ФГОС-направлений шли подряд):

```ts
export const DIRECTIONS = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
  'Адаптация к изменяющимся условиям',  // ← NEW (только ООО/СОО)
  'Семейные ценности',
  'Профориентация',
  'Здоровый образ жизни',
] as const
```

- [ ] **2.3.** Расширить `FORMATS` — добавить новые форматы для не-РоВ типов:

```ts
export const FORMATS = [
  'классный час',
  'беседа',
  'квиз',
  'игра',
  'мастерская',
  'киноклуб',
  'дебаты',
  'проектная сессия',
  // НОВЫЕ:
  'мастер-класс',
  'творческая мастерская',
  'практикум',
  'кейс-сессия',
  'лабораторная',
  'эксперимент',
  'проект',
  'олимпиадный тренинг',
  'праздник',
  'тематический день',
  'КТД',
] as const
```

- [ ] **2.4.** Расширить `DURATIONS`:

```ts
export const DURATIONS = [20, 30, 40, 45, 60, 90] as const
```

- [ ] **2.5.** Проверки:

```bash
pnpm exec tsc --noEmit
pnpm test
```

Ожидание: типы зелёные; существующие тесты не падают (типы `Direction`/`Format` расширились, не сузились). Если падают `personal-results.test.ts` или `levels.test.ts` — это нормально, исправим в задачах 3–4.

- [ ] **2.6.** Commit:

```bash
git add lib/scenario/options.ts
git commit -m "feat(options): LESSON_TYPES + LITERACY_KINDS + расширение DIRECTIONS/FORMATS/DURATIONS"
```

---

## Task 3: gradeToRovGroup + canonicalDirection для Адаптации (TDD)

**Files:**
- Modify: `lib/scenario/levels.ts`
- Create/Modify: `tests/lib/scenario/levels.test.ts`

### Шаги

- [ ] **3.1.** Создать `tests/lib/scenario/levels.test.ts` (если нет) и добавить тесты:

```ts
import { describe, it, expect } from 'vitest'
import { gradeToLevel, gradeToRovGroup, canonicalDirection } from '@/lib/scenario/levels'

describe('gradeToRovGroup', () => {
  it.each([
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-4'],
    [4, '3-4'],
    [5, '5-7'],
    [6, '5-7'],
    [7, '5-7'],
    [8, '8-9'],
    [9, '8-9'],
    [10, '10-11'],
    [11, '10-11'],
    [12, 'СПО'],
  ])('grade %i → %s', (grade, expected) => {
    expect(gradeToRovGroup(grade)).toBe(expected)
  })
})

describe('canonicalDirection — новое направление «Адаптация…»', () => {
  it('Адаптация к изменяющимся условиям → Адаптация', () => {
    expect(canonicalDirection('Адаптация к изменяющимся условиям')).toBe('Адаптация')
  })
})
```

- [ ] **3.2.** Run:

```bash
pnpm exec vitest run tests/lib/scenario/levels.test.ts
```

Ожидание: FAIL — `gradeToRovGroup` не экспортирован; `canonicalDirection('Адаптация…')` падает.

- [ ] **3.3.** В `lib/scenario/levels.ts`:

(а) Добавить новый канонический тип в `CanonicalDirection`:

```ts
export type CanonicalDirection =
  | 'Гражданское'
  | 'Патриотическое'
  | 'Духовно-нравственное'
  | 'Эстетическое'
  | 'Физическое и здоровье'
  | 'Трудовое'
  | 'Экологическое'
  | 'Познавательное'
  | 'Адаптация'  // ← NEW
```

(б) Добавить маппинг в `DIRECTION_MAP`:

```ts
const DIRECTION_MAP: Record<Direction, CanonicalDirection> = {
  // ... existing
  'Адаптация к изменяющимся условиям': 'Адаптация',
}
```

(в) Добавить функцию `gradeToRovGroup`:

```ts
export type RovGroup = '1-2' | '3-4' | '5-7' | '8-9' | '10-11' | 'СПО'

export function gradeToRovGroup(grade: number): RovGroup {
  if (grade === 12) return 'СПО'
  if (grade <= 2) return '1-2'
  if (grade <= 4) return '3-4'
  if (grade <= 7) return '5-7'
  if (grade <= 9) return '8-9'
  return '10-11'
}
```

- [ ] **3.4.** Run tests:

```bash
pnpm exec vitest run tests/lib/scenario/levels.test.ts
```

Ожидание: PASS.

- [ ] **3.5.** Полные гейты:

```bash
pnpm test && pnpm exec tsc --noEmit
```

Ожидание: все зелёные.

- [ ] **3.6.** Commit:

```bash
git add lib/scenario/levels.ts tests/lib/scenario/levels.test.ts
git commit -m "feat(levels): gradeToRovGroup + canonicalDirection для «Адаптация…»"
```

---

## Task 4: Каталог личностных результатов — Адаптация для ООО/СОО (TDD)

**Files:**
- Modify: `lib/scenario/personal-results.ts`
- Modify: `tests/lib/scenario/personal-results.test.ts`

**Контекст:** Формулировки из ФГОС ООО (приказ 287, п. 42, направление «адаптация к изменяющимся условиям социальной и природной среды») и ФГОС СОО (приказ 413 в ред. 732, п. 7.1, аналогичное направление). НОО (приказ 286) это направление НЕ предусматривает — для уровня НОО ячейка ОТСУТСТВУЕТ. Точные формулировки см. в опорной правовой базе обзора §4.6.

### Шаги

- [ ] **4.1.** Открыть `lib/scenario/personal-results.ts`, найти `CATALOG`. Структура `Record<Level, Record<CanonicalDirection, string[]>>`. Добавить ячейку `Адаптация` для ООО и СОО:

```ts
// в CATALOG.OOO:
Адаптация: [
  'освоение обучающимися социального опыта, основных социальных ролей, норм и правил общественного поведения',
  'способность обучающихся к саморазвитию и личностному самоопределению в изменяющихся условиях социальной среды',
  'готовность к принятию решений в нестандартных социальных ситуациях, в том числе в условиях неопределённости',
  'умение осваивать новые виды учебной и социальной деятельности',
],
// в CATALOG.SOO:
Адаптация: [
  'способность обучающихся к саморазвитию, самостоятельности и личностному самоопределению в изменяющихся условиях социальной и природной среды',
  'готовность к самостоятельной творческой деятельности и принятию ответственных решений',
  'умение действовать в условиях неопределённости, осваивать новые виды деятельности',
],
```

Источник в комменте к ячейке (как в существующих): «// ФГОС ООО п. 42 (приказ Минпросвещения от 31.05.2021 № 287)» / «// ФГОС СОО п. 7.1 (приказ Минобрнауки № 413 в ред. № 732)».

В `CATALOG.NOO` — ячейка НЕ добавляется (нормативно отсутствует).

- [ ] **4.2.** В `getCatalog(level, direction)` (или эквивалентная функция выбора): для НОО + Адаптация возвращать `[]` или null — посмотри по существующей сигнатуре. Если функция строго ожидает запись — добавить ветку «если nofnoo+Адаптация → []» **с тестом**.

- [ ] **4.3.** Добавить тесты в `tests/lib/scenario/personal-results.test.ts`:

```ts
describe('Каталог: новое направление «Адаптация…»', () => {
  it('ООО + Адаптация → непустой набор формулировок', () => {
    const items = getCatalog('OOO', 'Адаптация к изменяющимся условиям')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it('СОО + Адаптация → непустой набор', () => {
    const items = getCatalog('SOO', 'Адаптация к изменяющимся условиям')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it('НОО + Адаптация → пустой (нормативно отсутствует)', () => {
    const items = getCatalog('NOO', 'Адаптация к изменяющимся условиям')
    expect(items).toEqual([])
  })

  it('selectPersonalResults для НОО+Адаптация добирает 0 — возвращает []', () => {
    const items = selectPersonalResults([], getCatalog('NOO', 'Адаптация к изменяющимся условиям'))
    expect(items).toEqual([])
  })
})
```

- [ ] **4.4.** Run, гейты, commit:

```bash
pnpm exec vitest run tests/lib/scenario/personal-results.test.ts
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/personal-results.ts tests/lib/scenario/personal-results.test.ts
git commit -m "feat(catalog): личностные результаты для «Адаптация…» (ООО + СОО)"
```

---

## Task 5: Schema — lessonType + новые поля + ветвление superRefine (TDD)

**Files:**
- Modify: `lib/scenario/schema.ts`
- Create/Modify: `tests/lib/scenario/schema.test.ts`

### Шаги

- [ ] **5.1.** Тесты сначала (`tests/lib/scenario/schema.test.ts`, добавить describe-блок):

```ts
import { describe, it, expect } from 'vitest'
import { generationInputSchema, scenarioContentSchema } from '@/lib/scenario/schema'

describe('generationInputSchema — lessonType', () => {
  const base = {
    topic: 'Дружба',
    grade: 5,
    durationMin: 30,
    format: 'беседа',
  }

  it('rov: direction обязательно', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'rov' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('direction'))).toBe(true)
  })

  it('rov: с direction — успех', () => {
    const r = generationInputSchema.safeParse({
      ...base,
      lessonType: 'rov',
      direction: 'Патриотическое',
    })
    expect(r.success).toBe(true)
  })

  it('event: direction обязательно', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'event' })
    expect(r.success).toBe(false)
  })

  it('subject_extension: subject обязателен; direction не обязателен', () => {
    const noSubj = generationInputSchema.safeParse({ ...base, lessonType: 'subject_extension' })
    expect(noSubj.success).toBe(false)
    const ok = generationInputSchema.safeParse({
      ...base,
      lessonType: 'subject_extension',
      subject: 'Физика',
    })
    expect(ok.success).toBe(true)
  })

  it('literacy: literacyKind обязателен', () => {
    const no = generationInputSchema.safeParse({ ...base, lessonType: 'literacy' })
    expect(no.success).toBe(false)
    const ok = generationInputSchema.safeParse({
      ...base,
      lessonType: 'literacy',
      literacyKind: 'math',
    })
    expect(ok.success).toBe(true)
  })

  it('krujok: достаточно темы — direction/subject/literacyKind не требуются', () => {
    const r = generationInputSchema.safeParse({ ...base, lessonType: 'krujok' })
    expect(r.success).toBe(true)
  })

  it('СанПиН-кап работает на всех типах', () => {
    const r = generationInputSchema.safeParse({
      ...base,
      lessonType: 'krujok',
      grade: 1,
      durationMin: 60,
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('durationMin'))).toBe(true)
  })
})

describe('scenarioContentSchema — новые опц. поля', () => {
  const baseContent = {
    title: 'X',
    goals: ['G'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Вход',
        duration_min: 5,
        activities: [{ type: 'discussion', text: 'A' }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  }

  it('metaResults опц. — пустой content валиден', () => {
    expect(scenarioContentSchema.safeParse(baseContent).success).toBe(true)
  })

  it('metaResults с непустыми элементами — ок', () => {
    expect(
      scenarioContentSchema.safeParse({ ...baseContent, metaResults: ['уметь работать с информацией'] })
        .success,
    ).toBe(true)
  })

  it('subject + literacyKind принимаются', () => {
    expect(
      scenarioContentSchema.safeParse({
        ...baseContent,
        subject: 'Физика',
        literacyKind: 'math',
      }).success,
    ).toBe(true)
  })
})
```

- [ ] **5.2.** Run: `pnpm exec vitest run tests/lib/scenario/schema.test.ts` — FAIL (lessonType неизвестен; subject/literacyKind не описаны).

- [ ] **5.3.** Обновить `lib/scenario/schema.ts`:

(а) Импорт:

```ts
import { DIRECTIONS, FORMATS, SPO_GRADE, formatGrade, LESSON_TYPE_VALUES, LITERACY_KINDS } from './options'
```

(б) `scenarioContentSchema` — добавить опц. поля:

```ts
export const scenarioContentSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(),
  coreMeanings: z.array(z.string()).optional(),
  personalResults: z.array(z.string().min(1)).max(8).optional(),
  metaResults: z.array(z.string().min(1)).max(10).optional(),         // NEW
  subjectResults: z.array(z.string().min(1)).max(10).optional(),      // NEW
  subject: z.string().min(1).max(80).optional(),                       // NEW
  literacyKind: z.enum(LITERACY_KINDS.map((k) => k.value) as [string, ...string[]]).optional(), // NEW
  materials: z.array(z.string()),
  stages: z.array(stageSchema).min(1),
  adaptations: z.object({
    simpler: z.string().min(1),
    harder: z.string().min(1),
  }),
})
```

(в) `generationInputSchema` — переписать с ветвлением:

```ts
const literacyKindValues = LITERACY_KINDS.map((k) => k.value) as [string, ...string[]]

export const generationInputSchema = z
  .object({
    lessonType: z.enum(LESSON_TYPE_VALUES as [string, ...string[]]),
    direction: z.enum(DIRECTIONS).optional(),
    subject: z.string().trim().min(1).max(80).optional(),
    literacyKind: z.enum(literacyKindValues).optional(),
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
    if ((data.lessonType === 'rov' || data.lessonType === 'event') && !data.direction) {
      ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Выберите направление воспитания.' })
    }
    if (data.lessonType === 'subject_extension' && !data.subject) {
      ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Укажите школьный предмет.' })
    }
    if (data.lessonType === 'literacy' && !data.literacyKind) {
      ctx.addIssue({
        code: 'custom',
        path: ['literacyKind'],
        message: 'Выберите вид функциональной грамотности.',
      })
    }
  })
```

(г) `skeletonSchema` — добавить опц. поля, чтобы LLM мог их вернуть на этапе каркаса:

```ts
export const skeletonSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(),
  coreMeanings: z.array(z.string()).optional(),
  personalResults: z.array(z.string()).optional(),
  metaResults: z.array(z.string()).optional(),     // NEW
  subjectResults: z.array(z.string()).optional(),  // NEW
  materials: z.array(z.string()).optional(),
  adaptations: z.object({ simpler: z.string(), harder: z.string() }).partial().optional(),
  stages: z.array(skeletonStageSchema).min(1),
})
```

- [ ] **5.4.** Run, гейты, commit:

```bash
pnpm exec vitest run tests/lib/scenario/schema.test.ts
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/schema.ts tests/lib/scenario/schema.test.ts
git commit -m "feat(schema): lessonType + ветвление superRefine + опц. поля metaResults/subjectResults/subject/literacyKind"
```

---

## Task 6: embed-query helper (TDD)

**Files:**
- Create: `lib/scenario/embed-query.ts`
- Create: `tests/lib/scenario/embed-query.test.ts`

### Шаги

- [ ] **6.1.** Тесты:

```ts
import { describe, it, expect } from 'vitest'
import { buildEmbedQuery } from '@/lib/scenario/embed-query'

describe('buildEmbedQuery', () => {
  it('rov: direction + grade + topic + format', () => {
    const q = buildEmbedQuery({
      lessonType: 'rov',
      direction: 'Патриотическое',
      grade: 6,
      topic: 'День народного единства',
      format: 'беседа',
    })
    expect(q).toContain('Патриотическое')
    expect(q).toContain('День народного единства')
    expect(q).toContain('6 класс')
    expect(q).toContain('беседа')
  })

  it('subject_extension: содержит subject', () => {
    const q = buildEmbedQuery({
      lessonType: 'subject_extension',
      subject: 'Физика',
      grade: 8,
      topic: 'Сила трения',
      format: 'эксперимент',
    })
    expect(q).toContain('Физика')
    expect(q).toContain('Сила трения')
  })

  it('literacy: содержит лейбл вида грамотности', () => {
    const q = buildEmbedQuery({
      lessonType: 'literacy',
      literacyKind: 'math',
      grade: 7,
      topic: 'Оптимальный маршрут',
      format: 'кейс-сессия',
    })
    expect(q).toContain('Математическая грамотность')
  })

  it('krujok: без direction — только тема/формат/класс', () => {
    const q = buildEmbedQuery({
      lessonType: 'krujok',
      grade: 5,
      topic: 'Робототехника Arduino',
      format: 'мастер-класс',
    })
    expect(q).toContain('Робототехника Arduino')
    expect(q).toContain('мастер-класс')
  })
})
```

- [ ] **6.2.** Реализация `lib/scenario/embed-query.ts`:

```ts
import { formatGrade, literacyKindLabel, type LessonType, type LiteracyKind } from './options'

export interface EmbedQueryInput {
  lessonType: LessonType
  topic: string
  grade: number
  format: string
  direction?: string
  subject?: string
  literacyKind?: LiteracyKind
}

export function buildEmbedQuery(input: EmbedQueryInput): string {
  const parts: string[] = []
  if (input.lessonType === 'subject_extension' && input.subject) parts.push(input.subject)
  if (input.lessonType === 'literacy' && input.literacyKind) parts.push(literacyKindLabel(input.literacyKind))
  if (input.direction) parts.push(input.direction)
  parts.push(input.topic, formatGrade(input.grade), input.format)
  return parts.filter(Boolean).join(' ')
}
```

- [ ] **6.3.** Гейты + commit:

```bash
pnpm exec vitest run tests/lib/scenario/embed-query.test.ts
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/embed-query.ts tests/lib/scenario/embed-query.test.ts
git commit -m "feat(scenario): embed-query helper для type-aware pre-match/RAG"
```

---

## Task 7: Quality gate — ветвление по lessonType (TDD)

**Files:**
- Modify: `lib/scenario/quality.ts`
- Modify: `tests/lib/scenario/quality.test.ts`

**Контекст:** Сейчас `checkBlock(block, ...)` зашит под РоВ (требует «Учитель:»-реплик, ≥3 вопросов в discussion). Нужно добавить аргумент `lessonType` и применять РоВ-стиль только для `rov`/`event`. Для `krujok`/`literacy`/`subject_extension` — мягкие пороги.

### Шаги

- [ ] **7.1.** Открой `lib/scenario/quality.ts`, прочти текущую сигнатуру `checkBlock` и `checkScenario`. Запомни список существующих проверок.

- [ ] **7.2.** Добавь тесты (расширь `tests/lib/scenario/quality.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { checkBlock } from '@/lib/scenario/quality'

const longText = 'А'.repeat(700)
const teacherLong = `Учитель: ${'Б'.repeat(50)} Ответы обучающихся. Учитель: ${'В'.repeat(50)}`

describe('checkBlock — ветвление по lessonType', () => {
  it('rov: блок без «Учитель:» — thin', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: longText, questions: [] },
      { lessonType: 'rov' },
    )
    expect(r.ok).toBe(false)
  })

  it('rov: блок с «Учитель:» и достаточной длиной — ok', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: teacherLong + ' '.repeat(600), questions: [] },
      { lessonType: 'rov' },
    )
    expect(r.ok).toBe(true)
  })

  it('krujok: «Учитель:» НЕ обязательно, длина шага ≥200 — ok', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: 'А'.repeat(250), questions: [] },
      { lessonType: 'krujok' },
    )
    expect(r.ok).toBe(true)
  })

  it('literacy: тот же мягкий порог', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: 'А'.repeat(250), questions: [] },
      { lessonType: 'literacy' },
    )
    expect(r.ok).toBe(true)
  })

  it('subject_extension: тот же мягкий порог', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: 'А'.repeat(250), questions: [] },
      { lessonType: 'subject_extension' },
    )
    expect(r.ok).toBe(true)
  })

  it('event: РоВ-стиль (как rov)', () => {
    const r = checkBlock(
      { type: 'main', focus: 'x', text: longText, questions: [] },
      { lessonType: 'event' },
    )
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **7.3.** Run: FAIL (новый аргумент не принят).

- [ ] **7.4.** Обнови `lib/scenario/quality.ts`:

(а) Сигнатура `checkBlock` принимает второй аргумент `opts: { lessonType: LessonType; minBlockChars?: number; ... }`.

(б) Внутри `checkBlock` развести проверки:

```ts
const strictRovTypes = new Set<LessonType>(['rov', 'event'])
const isStrict = strictRovTypes.has(opts.lessonType)

const minChars = isStrict ? (opts.minBlockChars ?? MIN_BLOCK_CHARS) : (opts.minStepChars ?? MIN_STEP_CHARS)
if (block.text.length < minChars) return { ok: false, reason: 'thin' }

if (isStrict) {
  // существующие проверки: «Учитель:»-ритм, MIN_TEACHER_TURN_CHARS, ≥3 вопроса в discussion, MIN_QUESTION_CHARS
  // — без изменений в логике
} else {
  // мягкий путь: длина уже проверена, других обязательных проверок нет.
  // Можно опционально проверить наличие глагола действия — но это для будущей калибровки.
}
```

(в) Добавить env-пороги:

```ts
const MIN_STEP_CHARS = Number(process.env.MIN_STEP_CHARS ?? 200)
```

(г) `checkScenario(content, opts: { lessonType: LessonType })` — рефлексия-warning'и остаются для всех типов; «нет рефлексии» — мягкий warning для всех (это валидно для функграма тоже).

- [ ] **7.5.** Обнови все вызовы `checkBlock` и `checkScenario` в кодовой базе — добавь `lessonType`. Используй `grep`:

```bash
grep -rn "checkBlock\|checkScenario" lib/ app/ tests/
```

Найдёшь использования в `lib/scenario/block-gen.ts`, `lib/scenario/stream.ts`, `lib/scenario/regenerate.ts`. На этом этапе передавай `'rov'` как заглушку — переключим в Task 13–14.

- [ ] **7.6.** Run all tests + tsc, commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/quality.ts lib/scenario/block-gen.ts lib/scenario/stream.ts lib/scenario/regenerate.ts tests/lib/scenario/quality.test.ts
git commit -m "feat(quality): ветвление checkBlock/checkScenario по lessonType (rov/event строго, остальное мягко)"
```

---

## Task 8: Промпты — shared.ts + index.ts dispatcher (foundation)

**Files:**
- Create: `lib/scenario/prompts/shared.ts`
- Create: `lib/scenario/prompts/index.ts`

**Цель:** Подготовить инфраструктуру до того, как начнём переносить РоВ-логику. На этом этапе диспетчер пустой (бросает «not implemented» для всех типов кроме `rov`, который пока продолжает идти через старый `prompt.ts`).

### Шаги

- [ ] **8.1.** Прочти `lib/scenario/prompt.ts` целиком — это будет основа для разбиения. Заметь: общие хелперы (`buildMethodologyBlock`, `buildMaterialBlock`, `buildGoodExamplesBlock`, JSON-формат, правило фактов) — экстрактим в `shared.ts`.

- [ ] **8.2.** Создай `lib/scenario/prompts/shared.ts`:

```ts
import type { ChatMessage } from '@/lib/gigachat/client'
import type { RagChunk } from '@/lib/rag/retrieve'
import type { SharedExample } from '@/lib/community/prematch'

export const JSON_FORMAT_HINT = `Отвечай СТРОГО валидным JSON без дополнительного текста и без markdown-обёрток.`

export const RULE_NO_HALLUCINATIONS = `Не выдумывай конкретику: даты, имена, цитаты, статистику, названия. Если нет опоры в [TEACHER_MATERIAL] или [RELEVANT_METHODOLOGY] — подавай гипотетически («представим, что…», «можно обсудить пример из жизни»).`

export const RULE_NO_GRADING = `Отметки на занятии не выставляются — не предлагай выставлять баллы.`

export function buildMethodologyBlock(chunks: RagChunk[]): string {
  if (!chunks.length) return ''
  const lines = chunks.map((c, i) => `[${i + 1}] ${c.text.slice(0, 800)}`)
  return `\n[RELEVANT_METHODOLOGY]\n${lines.join('\n\n')}\n`
}

export function buildMaterialBlock(text?: string): string {
  if (!text) return ''
  return `\n[TEACHER_MATERIAL]\n${text}\n`
}

export function buildGoodExamplesBlock(examples: SharedExample[]): string {
  if (!examples.length) return ''
  const lines = examples.map((e) => {
    const stages = (e.content.stages ?? []).map((s) => s.title).join(' / ')
    return `- «${e.content.title}» (этапы: ${stages})`
  })
  return `\n[GOOD_EXAMPLES]\n${lines.join('\n')}\n`
}

export interface PromptDeps {
  chunks: RagChunk[]
  examples: SharedExample[]
  userMaterial?: string
}
```

*Точные импорты типов `RagChunk` и `SharedExample` — посмотри в существующих файлах и адаптируй.*

- [ ] **8.3.** Создай `lib/scenario/prompts/index.ts`:

```ts
import type { ChatMessage } from '@/lib/gigachat/client'
import type { GenerationInput, ScenarioSkeleton, SkeletonBlock } from '@/lib/scenario/schema'
import type { LessonType } from '@/lib/scenario/options'
import type { PromptDeps } from './shared'

// Per-type imports — добавятся в задачах 9–13:
// import * as Rov from './rov'
// import * as Krujok from './krujok'
// ...

export function buildSkeletonMessages(input: GenerationInput, deps: PromptDeps): ChatMessage[] {
  switch (input.lessonType) {
    case 'rov':
      // временно делегируем в старый prompt.ts; переедет в Task 9
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('../prompt').buildSkeletonMessages(input, deps)
    default:
      throw new Error(`Промпты для lessonType=${input.lessonType} ещё не реализованы.`)
  }
}

export function buildBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  block: SkeletonBlock & { stageIndex: number; blockIndex: number },
  runningContext: string,
  deps: PromptDeps,
): ChatMessage[] {
  switch (input.lessonType) {
    case 'rov':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('../prompt').buildBlockMessages(input, skeleton, block, runningContext, deps)
    default:
      throw new Error(`buildBlockMessages для lessonType=${input.lessonType} ещё не реализован.`)
  }
}

export function getPromptVersion(lessonType: LessonType): string {
  switch (lessonType) {
    case 'rov':
      return 'v10-rov-2026-05-30'
    case 'krujok':
      return 'v1-krujok-2026-05-30'
    case 'literacy':
      return 'v1-literacy-2026-05-30'
    case 'subject_extension':
      return 'v1-subject-2026-05-30'
    case 'event':
      return 'v1-event-2026-05-30'
  }
}
```

- [ ] **8.4.** Гейты + commit (тестов нет, это foundation):

```bash
pnpm exec tsc --noEmit
git add lib/scenario/prompts/
git commit -m "scaffold(prompts): shared.ts + index.ts диспетчер (rov делегирует в старый prompt.ts)"
```

---

## Task 9: Перенос РоВ-логики в lib/scenario/prompts/rov.ts

**Files:**
- Create: `lib/scenario/prompts/rov.ts`
- Modify: `lib/scenario/prompts/index.ts`
- Modify: `lib/scenario/prompt.ts` (обнулить — оставить только реэкспорт)

**Цель:** Перенести `buildSkeletonMessages`/`buildBlockMessages` из `prompt.ts` в `prompts/rov.ts` **без изменения поведения**. Это рефакторинг: тесты должны остаться зелёными. Уточнения промпта РоВ (видеовход, термины, регион/семьи, 5 видов деятельности) добавляем в этой же задаче — они согласованы спекой §7.1.

### Шаги

- [ ] **9.1.** Скопируй содержимое `lib/scenario/prompt.ts` в `lib/scenario/prompts/rov.ts`. Адаптируй импорты на новые пути; общие хелперы (`JSON_FORMAT_HINT`, `buildMethodologyBlock`, `buildMaterialBlock`, `buildGoodExamplesBlock`) **импортируй из `./shared`** вместо локальных. Локальные копии в `rov.ts` удали.

- [ ] **9.2.** Переименуй экспорты:

```ts
export function buildRovSkeletonMessages(...) { ... }
export function buildRovBlockMessages(...) { ... }
```

- [ ] **9.3.** Добавь в системный промпт РоВ-каркаса (`buildRovSkeletonMessages`) **новые инструкции** (§7.1 спеки):

```
- Сценарий относится к курсу «Разговоры о важном» (1-й урок понедельника).
- Возрастная группа курса РоВ: ${gradeToRovGroup(input.grade)}.
- Первый блок мотивационной части — обсуждение видеоматериала. Видео учитель подберёт сам; ты в задании пиши «просмотр и обсуждение короткого видеоролика по теме» и указывай 2–3 ключевых вопроса для обсуждения, не выдумывай ссылку.
- Точное усвоение нового термина не является целью занятия — через год учитель вернётся к этой теме. Не педалируй заучивание определений.
- Адаптируй задания под региональный/этнокультурный контекст и состав семей класса (учитель уточнит при правке).
- В основной части сочетай ≥3 видов деятельности из пяти: интеллектуальную, коммуникативную, практическую, игровую, творческую.
```

- [ ] **9.4.** Бамп `PROMPT_VERSION`:

```ts
export const PROMPT_VERSION = 'v10-rov-2026-05-30'
```

- [ ] **9.5.** В `lib/scenario/prompts/index.ts` замени `require('../prompt')` на честный импорт:

```ts
import * as Rov from './rov'

// в buildSkeletonMessages:
case 'rov': return Rov.buildRovSkeletonMessages(input, deps)
// в buildBlockMessages:
case 'rov': return Rov.buildRovBlockMessages(input, skeleton, block, runningContext, deps)
```

- [ ] **9.6.** `lib/scenario/prompt.ts` — превратить в реэкспорт для обратной совместимости:

```ts
// Тонкий barrel — все вызывающие должны переехать на @/lib/scenario/prompts.
// Файл будет удалён в следующей итерации.
export { buildSkeletonMessages, buildBlockMessages, getPromptVersion } from './prompts'
export const PROMPT_VERSION = 'v10-rov-2026-05-30'
```

- [ ] **9.7.** Запусти все тесты. **Особое внимание:** prompt-snapshot тесты, если есть, нужно обновить (новые строки в системном сообщении).

```bash
pnpm test && pnpm exec tsc --noEmit
```

Если падают prompt-снэпшоты — обнови их (`-u` flag для vitest). Это ожидаемо.

- [ ] **9.8.** Commit:

```bash
git add lib/scenario/prompts/ lib/scenario/prompt.ts tests/
git commit -m "refactor(prompts): РоВ-логика → prompts/rov.ts + видеовход/термины/регион/5 видов деятельности"
```

---

## Task 10: prompts/krujok.ts

**Files:**
- Create: `lib/scenario/prompts/krujok.ts`
- Modify: `lib/scenario/prompts/index.ts`

**Контекст:** §7.2 спеки. Свободная форма, без обязательного видеовхода, без whitelist личностных. Главный результат — развитие интереса и/или практическое умение.

### Шаги

- [ ] **10.1.** Создай `lib/scenario/prompts/krujok.ts` — структура зеркалит `rov.ts`, но системный промпт другой:

```ts
import type { ChatMessage } from '@/lib/gigachat/client'
import type { GenerationInput, ScenarioSkeleton, SkeletonBlock } from '@/lib/scenario/schema'
import { formatGradeForPrompt } from '@/lib/scenario/options'
import {
  JSON_FORMAT_HINT,
  RULE_NO_HALLUCINATIONS,
  RULE_NO_GRADING,
  buildMethodologyBlock,
  buildMaterialBlock,
  buildGoodExamplesBlock,
  type PromptDeps,
} from './shared'

const SYSTEM_KRUJOK = `Ты — методист, помогаешь учителю придумать занятие тематического кружка / клуба по интересам.

Жанровые рамки:
- Это НЕ урок и НЕ «Разговоры о важном». Структура свободная, трёхчастная не обязательна.
- Видеовход НЕ обязателен — включай видео или демонстрацию только если она естественно ложится в тему.
- Главный «выход» занятия — развитие интереса и/или конкретное практическое умение, а не личностные результаты ФГОС.
- Формы: мастер-класс, творческая мастерская, игра, проект, дискуссия, показ — выбирай под тему.
- Отметки не выставляются.

${RULE_NO_HALLUCINATIONS}
${RULE_NO_GRADING}

${JSON_FORMAT_HINT}`

export const PROMPT_VERSION = 'v1-krujok-2026-05-30'

export function buildKrujokSkeletonMessages(input: GenerationInput, deps: PromptDeps): ChatMessage[] {
  const user = [
    `Тема: ${input.topic}`,
    `Класс: ${formatGradeForPrompt(input.grade)}`,
    `Длительность: ${input.durationMin} минут`,
    `Формат: ${input.format}`,
    buildMaterialBlock(deps.userMaterial),
    buildMethodologyBlock(deps.chunks),
    buildGoodExamplesBlock(deps.examples),
    '',
    'Верни JSON каркаса занятия со структурой:',
    '{ "title": string, "goals": string[], "materials": string[],',
    '  "subjectResults": string[] (опц., что научились делать),',
    '  "stages": [ { "kind": "engage"|"main"|"reflection", "title": string, "duration_min": number,',
    '               "blocks": [ { "type": "discussion"|"quiz"|"game"|"task"|"video", "focus": string } ] } ],',
    '  "adaptations": { "simpler": string, "harder": string } }',
    '',
    'Не используй поля personalResults/values/coreMeanings — они для РоВ.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system', content: SYSTEM_KRUJOK },
    { role: 'user', content: user },
  ]
}

export function buildKrujokBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  block: SkeletonBlock & { stageIndex: number; blockIndex: number },
  runningContext: string,
  deps: PromptDeps,
): ChatMessage[] {
  const stage = skeleton.stages[block.stageIndex]
  const user = [
    `Тема занятия: ${skeleton.title}`,
    `Этап ${block.stageIndex + 1} «${stage.title}» (${stage.duration_min} мин).`,
    `Текущий блок: тип=${block.type}, фокус="${block.focus}".`,
    runningContext ? `\nЧто уже подготовлено для соседних блоков:\n${runningContext}` : '',
    buildMaterialBlock(deps.userMaterial),
    buildMethodologyBlock(deps.chunks),
    '',
    'Сгенерируй ОДНУ активность для этого блока. JSON формы:',
    '{ "type": "discussion"|"quiz"|"game"|"task"|"video", "text": string, "questions": string[] (опц.) }',
    '',
    'Текст активности должен быть подробным практическим описанием шагов (≥300 символов).',
    'Не выдумывай ссылок и точных цифр без опоры на материалы.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system', content: SYSTEM_KRUJOK },
    { role: 'user', content: user },
  ]
}
```

- [ ] **10.2.** В `prompts/index.ts` подключи:

```ts
import * as Krujok from './krujok'
// ...
case 'krujok': return Krujok.buildKrujokSkeletonMessages(input, deps)
// в buildBlockMessages:
case 'krujok': return Krujok.buildKrujokBlockMessages(input, skeleton, block, runningContext, deps)
```

- [ ] **10.3.** Гейты, commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/prompts/krujok.ts lib/scenario/prompts/index.ts
git commit -m "feat(prompts): krujok — свободная форма, без whitelist личностных"
```

---

## Task 11: prompts/literacy.ts

**Files:**
- Create: `lib/scenario/prompts/literacy.ts`
- Modify: `lib/scenario/prompts/index.ts`

**Контекст:** §7.3 спеки. PISA/ФИОКО-стиль: контекст → кейс → разбор → перенос → рефлексия умения. `subjectResults` желательны.

### Шаги

- [ ] **11.1.** Создай файл по аналогии с `krujok.ts`. Системный промпт:

```
Ты — методист функциональной грамотности. Занятие — практикум, не урок.

Жанр {literacyKindLabel}:
- Структура: краткое введение контекста → жизненный кейс-задача → разбор решения → перенос на похожий кейс → рефлексия (что научились делать).
- Опирайся на формат задач PISA/ФИОКО: реальный жизненный контекст, многошаговое решение.
- Главный «выход» — формируемое умение функциональной грамотности (поле subjectResults).
- Видеовход НЕ обязателен.
- Отметки не выставляются.
```

В user-сообщении для каркаса: явно описывай ожидаемые типы этапов (контекст → кейс → разбор → перенос → рефлексия), просить `subjectResults` обязательно.

`PROMPT_VERSION = 'v1-literacy-2026-05-30'`.

- [ ] **11.2.** Подключить в `prompts/index.ts`. Гейты, commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/prompts/literacy.ts lib/scenario/prompts/index.ts
git commit -m "feat(prompts): literacy — PISA-стилевые кейсы, subjectResults обязательны"
```

---

## Task 12: prompts/subject.ts

**Files:**
- Create: `lib/scenario/prompts/subject.ts`
- Modify: `lib/scenario/prompts/index.ts`

**Контекст:** §7.4 спеки. Опыт/проект/лаборатория поверх предмета. Структура: гипотеза/задача → план → выполнение → обсуждение → перенос/обобщение.

### Шаги

- [ ] **12.1.** Создай файл. Системный промпт упирает на:
- Учитель ведёт занятие по предмету `${input.subject}`.
- Это внеурочное углубление: опыт, исследование, проект, олимпиадная задача.
- Структура: гипотеза/задача → план → выполнение → обсуждение результата → перенос.
- `subjectResults` обязательны (что научились/что измерили/что открыли).
- Не выдумывай конкретику опытов без опоры на материалы — описывай **методологию**, конкретные параметры пусть учитель уточнит.

`PROMPT_VERSION = 'v1-subject-2026-05-30'`.

- [ ] **12.2.** Подключить в index.ts. Гейты, commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/prompts/subject.ts lib/scenario/prompts/index.ts
git commit -m "feat(prompts): subject_extension — лаборатория/опыт/проект поверх предмета"
```

---

## Task 13: prompts/event.ts

**Files:**
- Create: `lib/scenario/prompts/event.ts`
- Modify: `lib/scenario/prompts/index.ts`

**Контекст:** §7.5 спеки. Воспит. мероприятие (не РоВ). Мягкая трёхчастная, направление воспитания обязательно (гарантирует superRefine), whitelist личностных применяется как в РоВ.

### Шаги

- [ ] **13.1.** Создай файл. Системный промпт похож на РоВ, но:
- Это **не РоВ**: видеовход не обязателен, нет привязки к понедельнику.
- Трёхчастная структура мягкая (мотив → основная → итог).
- Формат может быть праздником, КТД, тематическим днём.
- Whitelist личностных результатов ФГОС применяется (направление гарантировано задано).
- Включи `[PERSONAL_RESULTS_CATALOG]` секцию с инструкцией «выбери 3–5 ДОСЛОВНО» — как в РоВ.

Для построения каталога:

```ts
import { getCatalog } from '@/lib/scenario/personal-results'
import { gradeToLevel, canonicalDirection } from '@/lib/scenario/levels'
const catalog = getCatalog(gradeToLevel(input.grade), canonicalDirection(input.direction!))
```

`PROMPT_VERSION = 'v1-event-2026-05-30'`.

- [ ] **13.2.** Подключить в index.ts. Гейты, commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/scenario/prompts/event.ts lib/scenario/prompts/index.ts
git commit -m "feat(prompts): event — воспит. мероприятие (мягкая структура + whitelist личностных)"
```

---

## Task 14: Пайплайн — пробросить lessonType в stream/generate/regenerate/block-gen

**Files:**
- Modify: `lib/scenario/stream.ts`
- Modify: `lib/scenario/generate.ts`
- Modify: `lib/scenario/regenerate.ts`
- Modify: `lib/scenario/block-gen.ts`

**Цель:** Заменить заглушки `'rov'` из Task 7.5 на реальный `input.lessonType`. После этой задачи генерация для всех 5 типов должна доходить до диспетчера промптов.

### Шаги

- [ ] **14.1.** В `lib/scenario/stream.ts`:
- `streamScenario(input, deps)` уже принимает `input: GenerationInput`. Убедись, что `input.lessonType` пробрасывается во все вызовы `buildSkeletonMessages`/`buildBlockMessages`/`checkBlock`/`checkScenario` и `generateBlockWithGate`.
- `getPromptVersion(input.lessonType)` пиши в `meta.promptVersion` вместо жёсткой константы.
- Для каталога личностных результатов (`selectPersonalResults`): применять ТОЛЬКО если `input.lessonType === 'rov' || input.lessonType === 'event'`. Иначе оставлять `skeleton.personalResults` как есть.

- [ ] **14.2.** В `lib/scenario/generate.ts` — то же самое: пробросить `input.lessonType` в диспетчер, отказаться от `'rov'`-заглушки.

- [ ] **14.3.** В `lib/scenario/regenerate.ts`:
- Функция получает скрытый `lessonType` через `scenarioId` → нужно его узнать. Загружай `scenarios.lessonType` рядом со сценарием в `regenerateActivityAction` и пробрасывай в `regenerate.ts`.

- [ ] **14.4.** В `lib/scenario/block-gen.ts` `generateBlockWithGate`:
- Принимает `lessonType` в opts, пробрасывает в `buildBlockMessages` и `checkBlock`.

- [ ] **14.5.** Гейты:

```bash
pnpm test && pnpm exec tsc --noEmit
```

Все существующие тесты должны проходить (РоВ — дефолт у моков, ничего не сломано).

- [ ] **14.6.** Commit:

```bash
git add lib/scenario/stream.ts lib/scenario/generate.ts lib/scenario/regenerate.ts lib/scenario/block-gen.ts app/app/scenarios/
git commit -m "feat(pipeline): пробросить lessonType сквозь stream/generate/regenerate/block-gen"
```

---

## Task 15: Community — prematch с фильтром по типу + share/copy пробрасывают тип (TDD)

**Files:**
- Modify: `lib/community/prematch.ts`
- Modify: `lib/community/share-target.ts`
- Modify: `lib/community/copy.ts`
- Modify: `tests/lib/community/prematch.test.ts`

### Шаги

- [ ] **15.1.** В `tests/lib/community/prematch.test.ts` добавь:

```ts
it('фильтрует кандидатов по lessonType (hard)', async () => {
  const calls: string[] = []
  const fakeDb = {
    /* стаб, который записывает фильтр и возвращает заранее заготовленные строки только если lesson_type совпал */
  }
  const result = await findSimilarShared(
    { lessonType: 'krujok', direction: 'Познавательное', grade: 5, topic: 'Робототехника', format: 'мастер-класс' },
    { embed: async () => [Array(2560).fill(0)], db: fakeDb as any, threshold: 0.5 },
  )
  // ожидаемо: SQL содержит WHERE lesson_type = 'krujok'
})
```

(Точная форма стаба зависит от текущей реализации — посмотри `lib/community/prematch.ts` и подгони под существующий DI-паттерн.)

- [ ] **15.2.** Обнови `prematch.ts`:
- Принимает `lessonType` в входе.
- `buildEmbedQuery` из Task 6 заменяет inline-конкатенацию.
- SQL получает `AND lesson_type = ${lessonType}` (hard filter).

- [ ] **15.3.** `share-target.ts`: при INSERT в `shared_scenarios` укажи `lesson_type` (берём из source `scenarios.lessonType`).

- [ ] **15.4.** `copy.ts`: при копировании из shared в `scenarios` переноси `lesson_type` из `shared_scenarios`.

- [ ] **15.5.** Гейты + commit:

```bash
pnpm test && pnpm exec tsc --noEmit
git add lib/community/ tests/lib/community/
git commit -m "feat(community): prematch с hard-фильтром по lessonType; share/copy переносят тип"
```

---

## Task 16: API route + server actions — принимают lessonType

**Files:**
- Modify: `app/api/generate/stream/route.ts`
- Modify: `app/app/scenarios/[id]/actions.ts`
- Modify: `app/app/new/actions.ts` (если есть отдельные actions для prematch — обнови их)
- Modify: `app/app/new/material-actions.ts` (без изменений, материал тип-агностичен — проверь)

### Шаги

- [ ] **16.1.** В `app/api/generate/stream/route.ts`:
- Принимает поле `lessonType` (+ опц. `subject`/`literacyKind`).
- `generationInputSchema.safeParse` теперь это валидирует автоматически.
- При INSERT в `scenarios` пиши `lessonType: input.lessonType`.

- [ ] **16.2.** В `app/app/scenarios/[id]/actions.ts`:
- `saveScenarioAction`: при UPDATE `scenarios` не трогает `lessonType` (он фиксируется в момент создания).
- `regenerateActivityAction`: загружает `lessonType` сценария рядом с `content`, передаёт в `regenerate.ts`.
- `likeScenarioAction`: при создании записи в `shared_scenarios` копирует `lesson_type` из исходного сценария.
- `useSharedAsIsAction`: при копировании из `shared_scenarios` в `scenarios` копирует `lesson_type`.

- [ ] **16.3.** В `app/app/new/actions.ts` (если там есть prematch-action — `prematchAction`):
- Принимает `lessonType` из FormData.
- Прокидывает в `findSimilarShared`.

- [ ] **16.4.** Гейты + commit:

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm build
git add app/api/generate app/app/scenarios app/app/new
git commit -m "feat(actions): API/actions принимают и пишут lessonType"
```

---

## Task 17: LessonTypePicker — компонент шага 1 wizard

**Files:**
- Create: `components/scenario/LessonTypePicker.tsx`

### Шаги

- [ ] **17.1.** Создай server-component:

```tsx
import Link from 'next/link'
import { LESSON_TYPES, type LessonType } from '@/lib/scenario/options'
import { Card } from '@/components/ui/card'
import { Flag, Sparkles, Brain, FlaskConical, PartyPopper } from 'lucide-react'

const ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  rov: Flag,
  krujok: Sparkles,
  literacy: Brain,
  subject_extension: FlaskConical,
  event: PartyPopper,
}

export function LessonTypePicker({ extraQuery }: { extraQuery?: Record<string, string> }) {
  const qs = extraQuery
    ? '&' + new URLSearchParams(extraQuery).toString()
    : ''
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {LESSON_TYPES.map((t) => {
        const Icon = ICONS[t.value]
        return (
          <Link
            key={t.value}
            href={`/app/new?type=${t.value}${qs}`}
            className="block"
          >
            <Card className="p-5 h-full hover:shadow-hover transition-shadow ring-1 ring-neutral-200">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-onest text-lg font-semibold">{t.label}</h3>
                    {t.federal ? (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">
                        Федеральный курс
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        Программа школы
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-600">{t.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **17.2.** Гейты + commit:

```bash
pnpm exec tsc --noEmit && pnpm exec biome check components/scenario/LessonTypePicker.tsx
git add components/scenario/LessonTypePicker.tsx
git commit -m "feat(ui): LessonTypePicker — карточки 5 типов занятия"
```

---

## Task 18: `/app/new` — двухшаговый wizard + форма под тип

**Files:**
- Modify: `app/app/new/page.tsx`
- Возможно: `app/app/new/form.tsx` или эквивалент (если форма выделена)

### Шаги

- [ ] **18.1.** Прочти `app/app/new/page.tsx` целиком. Запомни текущую структуру (3 вкладки источника темы, форма, секция «свой материал», prematch).

- [ ] **18.2.** Логика страницы:
- Если `searchParams.type` пуст или не входит в `LESSON_TYPE_VALUES` → рендерим хедер «Создать сценарий — выберите тип» + `<LessonTypePicker extraQuery={{...прокидываем topic/planTopicId/calendarDate если есть}} />`. Никакой формы.
- Если `searchParams.type` задан → рендерим текущую форму + крошку «← Изменить тип» (ссылка на `/app/new` без `type`).

- [ ] **18.3.** Адаптация формы (шаг 2):
- В hidden input: `<input type="hidden" name="lessonType" value={type} />`.
- Лейбл «Направление воспитания»/`<select name="direction">`:
  - `rov`/`event`: рендерится, обязателен.
  - `subject_extension`: заменяется на `<input name="subject" placeholder="Физика, Биология, Математика..." required />`.
  - `literacy`: заменяется на `<select name="literacyKind">` с 4 опциями из `LITERACY_KINDS`.
  - `krujok`: скрыт. Подсказка под темой: «Сформулируйте тему кружка — например, „Робототехника Arduino: первое знакомство“.»
- Список форматов фильтруется. Можно сделать так: словарь `FORMATS_BY_TYPE: Record<LessonType, readonly Format[]>` (определи в `options.ts` или прямо здесь):

```ts
const FORMATS_BY_TYPE: Record<LessonType, readonly Format[]> = {
  rov: ['классный час', 'беседа', 'квиз', 'игра', 'киноклуб', 'дебаты'],
  krujok: ['мастер-класс', 'творческая мастерская', 'игра', 'мастерская', 'проектная сессия'],
  literacy: ['практикум', 'кейс-сессия', 'игра', 'квиз'],
  subject_extension: ['лабораторная', 'эксперимент', 'проект', 'олимпиадный тренинг'],
  event: ['классный час', 'праздник', 'тематический день', 'КТД', 'мастерская'],
}
```

(Определи в `lib/scenario/options.ts` — там уместнее, чем в UI.)

- Список длительностей: РоВ оставляем как сейчас (`[20,30,40]` ± кап); не-РоВ — `[30, 40, 45, 60, 90]`, СанПиН-кап применяется сервером.

- [ ] **18.4.** Префил темы из плана/календаря работает как раньше (через query). Pre-match action принимает `lessonType` (см. Task 16).

- [ ] **18.5.** Источник «Из плана» (вкладка): по умолчанию `type=rov`, потому что план обычно идёт под РоВ-стилистику классных часов. Это уже так через ссылку с `/app/plans/[id]` — поменяй её на `?type=rov&topic=...&planTopicId=...` (см. `app/app/plans/[id]/page.tsx`).

- [ ] **18.6.** Источник «Календарь» аналогично — ссылка с `/app/calendar` (компонент `CalendarGrid` или эквивалент) проставляет `?type=rov&topic=...&calendarDate=...`.

- [ ] **18.7.** Гейты + commit:

```bash
pnpm exec tsc --noEmit && pnpm build && pnpm exec biome check app/app/new app/app/plans app/app/calendar
git add app/app/new app/app/plans app/app/calendar components/calendar lib/scenario/options.ts
git commit -m "feat(ui): двухшаговый wizard /app/new — выбор типа → форма под тип"
```

---

## Task 19: Editor — адаптивные лейблы + новые Card'ы meta/subject results

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx`
- Modify: `app/app/scenarios/[id]/page.tsx` (если нужно прокинуть `lessonType` в editor)

### Шаги

- [ ] **19.1.** Прочти `editor.tsx`. Найди Card «Шапка» (где сейчас редактируется direction/title/grade/durationMin/format).

- [ ] **19.2.** Адаптируй лейбл главного классификатора по `meta.lessonType`:
- `rov`/`event`: «Направление воспитания» (как сейчас).
- `subject_extension`: «Предмет» — `<Input value={content.subject ?? ''} onChange={...}>` (`subject` живёт в content).
- `literacy`: «Вид грамотности» — `<select>` из `LITERACY_KINDS` (`content.literacyKind`).
- `krujok`: блок скрыт.

- [ ] **19.3.** Прокинь `meta.lessonType` в `editor.tsx`:
- В `page.tsx` в `scenario` уже есть `lessonType` после Task 1. Прокидывай в `<Editor meta={{...existing, lessonType: scenario.lessonType}} />`.
- Расширь тип `Meta` в `editor.tsx`.

- [ ] **19.4.** Добавь Card'ы между «Цели» и «Материалы»:

```tsx
{/* Метапредметные результаты — для всех типов */}
<Card className="p-5">
  <h3 className="font-onest text-lg font-semibold">Метапредметные результаты (УУД)</h3>
  <p className="mt-1 text-sm text-neutral-600">Универсальные учебные действия: познавательные, коммуникативные, регулятивные.</p>
  {/* Список <Textarea> + кнопка ✕ + «+ Добавить» — копируй паттерн с personalResults */}
</Card>

{/* Предметные результаты — для всех типов */}
<Card className="p-5">
  <h3 className="font-onest text-lg font-semibold">Планируемые предметные результаты</h3>
  {/* ... */}
</Card>
```

Управление `metaResults` и `subjectResults` массивами — паттерн `setContent({ ...content, metaResults: [...] })`.

- [ ] **19.5.** Card «Планируемые личностные результаты»:
- `rov`, `event`: показывается, лейбл подсказки «Из ФГОС {уровень}, направление «{direction}»».
- `krujok`/`literacy`/`subject_extension`: показывается, но подсказка без whitelist («Свободный список, не из каталога ФГОС»).

- [ ] **19.6.** Бейдж в шапке (под title): добавь первый бейдж `lessonTypeLabel(lessonType)`.

- [ ] **19.7.** Гейты + commit:

```bash
pnpm exec tsc --noEmit && pnpm build
git add app/app/scenarios
git commit -m "feat(ui): editor — адаптивные лейблы по lessonType + Card'ы метапредметных/предметных результатов"
```

---

## Task 20: Library — фильтр по типу + бейдж на SharedCard

**Files:**
- Modify: `app/app/library/page.tsx`
- Modify: `components/community/SharedCard.tsx` (или эквивалент)
- Возможно: `lib/community/search.ts` (если есть отдельная)

### Шаги

- [ ] **20.1.** В `/app/library/page.tsx`:
- В `searchParams` добавь поддержку `type?: LessonType | 'all'`. Дефолт — `'all'`.
- В SQL поиска: если `type !== 'all'` → `AND lesson_type = ?`.
- Над сеткой карточек — `<select>` фильтра:

```tsx
<form className="mb-4 flex items-center gap-3">
  <label htmlFor="type" className="text-sm text-neutral-700">Тип занятия:</label>
  <select name="type" id="type" defaultValue={type} className="...">
    <option value="all">Все типы</option>
    {LESSON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
  </select>
  {/* можно: input name="q" для поиска */}
  <button type="submit" className="...">Применить</button>
</form>
```

- [ ] **20.2.** `SharedCard`: добавь бейдж типа в углу:

```tsx
<span className="absolute right-3 top-3 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
  {lessonTypeLabel(shared.lessonType)}
</span>
```

(Передай `shared.lessonType` в проп.)

- [ ] **20.3.** Гейты + commit:

```bash
pnpm exec tsc --noEmit && pnpm build
git add app/app/library components/community
git commit -m "feat(ui): library — фильтр по lessonType + бейдж типа на карточке"
```

---

## Task 21: Export — адаптивная шапка + блоки meta/subject results

**Files:**
- Modify: `lib/export/document-model.ts`
- Modify: `tests/lib/export/document-model.test.ts`

### Шаги

- [ ] **21.1.** Тесты:

```ts
describe('document-model — адаптация шапки по lessonType', () => {
  it('rov: первая строка metaTable — "Тип занятия: Разговоры о важном"', () => {
    const doc = buildScenarioDocument(rovContent, { ...rovMeta, lessonType: 'rov' })
    const first = doc.blocks.find((b) => b.type === 'metaTable')
    expect(first?.rows[0]).toEqual(['Тип занятия', 'Разговоры о важном'])
  })

  it('subject_extension: строка "Предмет: Физика" вместо направления', () => {
    const doc = buildScenarioDocument(
      { ...rovContent, subject: 'Физика' },
      { ...rovMeta, lessonType: 'subject_extension', direction: undefined },
    )
    const metaTable = doc.blocks.find((b) => b.type === 'metaTable')
    expect(metaTable?.rows.some(([k, v]) => k === 'Предмет' && v === 'Физика')).toBe(true)
    expect(metaTable?.rows.some(([k]) => k === 'Направление воспитания')).toBe(false)
  })

  it('literacy: строка "Вид грамотности"', () => {
    const doc = buildScenarioDocument(
      { ...rovContent, literacyKind: 'math' },
      { ...rovMeta, lessonType: 'literacy', direction: undefined },
    )
    const metaTable = doc.blocks.find((b) => b.type === 'metaTable')
    expect(metaTable?.rows.some(([k, v]) => k === 'Вид грамотности' && v === 'Математическая грамотность')).toBe(true)
  })

  it('krujok: строка главного классификатора скрыта', () => {
    const doc = buildScenarioDocument(rovContent, {
      ...rovMeta,
      lessonType: 'krujok',
      direction: undefined,
    })
    const metaTable = doc.blocks.find((b) => b.type === 'metaTable')
    expect(metaTable?.rows.some(([k]) => k.includes('Направление') || k === 'Предмет' || k === 'Вид грамотности'))
      .toBe(false)
  })

  it('блок «Метапредметные результаты» — рендерится только при непустом', () => {
    const doc = buildScenarioDocument({ ...rovContent, metaResults: ['уметь работать с информацией'] }, rovMeta)
    const headings = doc.blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toContain('Планируемые метапредметные результаты')
  })

  it('блок «Предметные результаты» — рендерится только при непустом', () => {
    const doc = buildScenarioDocument({ ...rovContent, subjectResults: ['решать задачи на оптимизацию'] }, rovMeta)
    const headings = doc.blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toContain('Планируемые предметные результаты')
  })
})
```

- [ ] **21.2.** Реализуй в `lib/export/document-model.ts`:
- Принимай `meta.lessonType` (расширь `ExportMeta`).
- В `metaTable.rows`:
  - Первая строка: `['Тип занятия', lessonTypeLabel(meta.lessonType)]`.
  - Главный классификатор:
    - `rov`/`event`: `['Направление воспитания', meta.direction]` (как сейчас).
    - `subject_extension`: `['Предмет', content.subject ?? '—']`.
    - `literacy`: `['Вид грамотности', literacyKindLabel(content.literacyKind!)]`.
    - `krujok`: пропускаем строку.
  - Остальные строки (Тема / Класс / Длительность / Формат / Цель / Ценности / Оборудование) — как сейчас.
- После блока «Планируемые личностные результаты»:
  - `if (content.metaResults?.length)` → heading «Планируемые метапредметные результаты» + bullets.
  - `if (content.subjectResults?.length)` → heading «Планируемые предметные результаты» + bullets.

- [ ] **21.3.** Гейты + commit:

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm build
git add lib/export tests/lib/export
git commit -m "feat(export): адаптивная шапка по lessonType + блоки метапредметных/предметных результатов"
```

---

## Task 22: Backfill `rag_documents.lesson_type` для РоВ-корпуса и seed

**Files:**
- Create: `scripts/backfill-rag-lesson-type.ts`
- Modify: `package.json` (новый скрипт `backfill:rag-type`)

### Шаги

- [ ] **22.1.** Создай скрипт:

```ts
// scripts/backfill-rag-lesson-type.ts
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const { db } = await import('@/db')
  const { sql } = await import('drizzle-orm')

  const r1 = await db.execute(sql`
    UPDATE rag_documents SET lesson_type = 'rov'
    WHERE lesson_type IS NULL AND source IN ('razgovor', 'seed')
  `)
  console.log(`Updated razgovor+seed → rov: ${r1.rowCount ?? r1.count ?? '?'}`)

  // Если у вас есть документы с другим source — добавь явный маппинг.
  // Все остальные nullable записи остаются как есть (новые типы корпусов).
  const left = await db.execute(sql`
    SELECT source, count(*)::int AS n FROM rag_documents WHERE lesson_type IS NULL GROUP BY source
  `)
  console.log('Осталось без lesson_type:', left)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **22.2.** `package.json` — добавь скрипт:

```json
"backfill:rag-type": "tsx scripts/backfill-rag-lesson-type.ts"
```

- [ ] **22.3.** Прогон на dev-БД:

```bash
pnpm backfill:rag-type
```

Ожидание: «Updated razgovor+seed → rov: N» (≥0), «Осталось без lesson_type: []» (для свежего dev) или известный список.

- [ ] **22.4.** Идемпотентность: запусти ещё раз — UPDATE должен затронуть 0 строк (фильтр `WHERE lesson_type IS NULL`).

- [ ] **22.5.** Commit:

```bash
git add scripts/backfill-rag-lesson-type.ts package.json
git commit -m "chore(scripts): backfill rag_documents.lesson_type для РоВ-корпуса и seed"
```

---

## Task 23: Финальный QA + changelog v1.9.0 + CLAUDE.md

**Files:**
- Modify: `lib/changelog.ts`
- Modify: `CLAUDE.md`

### Шаги

- [ ] **23.1.** Полные гейты на финальном HEAD:

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm exec biome check && pnpm build
```

Все зелёные. Если biome ругается на pre-existing проблемы в `presentation/build.js` — игнорируй (не наш файл).

- [ ] **23.2.** Регрессионный smoke-тест:
- Открой dev-БД (`docker compose up -d`), убедись, что миграция применена (`pnpm db:migrate`).
- Открой `/app` — список существующих сценариев рендерится.
- Открой один существующий сценарий → редактор не падает; в шапке видишь бейдж «Разговоры о важном».
- Открой существующий сценарий → жми «PDF» → скачивается, в шапке первая строка «Тип занятия: Разговоры о важном».
- Открой `/app/library` → дефолт «Все типы», карточки помечены «Разговоры о важном».
- Открой `/app/new` → шаг 1, 5 карточек. Клик на «Тематический кружок» → шаг 2 без поля направления, есть подсказка темы кружка.

Если что-то ломается — отдельная задача-фикс (не в этой). Если всё ок — продолжай.

- [ ] **23.3.** Открой `lib/changelog.ts`. Найди запись `v1.9.0`. Добавь в её `changes` пункты (без создания v1.10.0 — пользователь явно попросил приписать в 1.9):

```ts
{
  kind: 'feature',
  text: 'Пять типов внеурочных занятий в /app/new: «Разговоры о важном», тематический кружок, функциональная грамотность, предметное углубление, воспитательное мероприятие. Каждый тип имеет свою форму, свой промпт и свои критерии качества.',
},
{
  kind: 'feature',
  text: 'В сценарии добавились разделы «Метапредметные результаты (УУД)» и «Планируемые предметные результаты» — для соответствия ФГОС-триаде результатов.',
},
{
  kind: 'improvement',
  text: 'Библиотека сообщества фильтруется по типу занятия; на каждой карточке виден бейдж типа. Похожие сценарии при создании ищутся только в своём типе.',
},
{
  kind: 'improvement',
  text: 'Добавлено направление воспитания «Адаптация к изменяющимся условиям социальной и природной среды» (для 5–11 классов, по ФГОС ООО/СОО).',
},
```

- [ ] **23.4.** Открой `CLAUDE.md`. В блоке «Пост-milestone изменения (на master, вне нумерованных планов)» допиши новый пункт **в конец** последнего блока этой секции, перед «Конвенции работы». Шаблон:

```md
- **Расширение типов внеурочных занятий (2026-05-30, на master):** реализовано через brainstorming → spec → writing-plans → subagent-driven (23 задачи, имплементер + spec/quality-review). Спека `docs/superpowers/specs/2026-05-30-lesson-types-expansion-design.md`, план `docs/superpowers/plans/2026-05-30-lesson-types-expansion.md`. **Миграция `0014`** (`lesson_type` на `scenarios`/`shared_scenarios`/`rag_documents`, default `'rov'`).
  - **5 типов:** `rov` (как было), `krujok` (свободная форма), `literacy` (PISA-стиль кейсов, обязательный `literacyKind`), `subject_extension` (опыт/проект/лаборатория, обязательный `subject`), `event` (воспит. мероприятие, мягкая трёхчастная, whitelist личностных). Профориентация — направление внутри `rov`/`event`, не отдельный тип.
  - **Промпты разнесены** в `lib/scenario/prompts/{shared,rov,krujok,literacy,subject,event,index}.ts` с диспетчером по `lessonType`. `lib/scenario/prompt.ts` — тонкий barrel-реэкспорт для совместимости (удалить в следующей итерации). РоВ-ветка усилена: явное требование видеовхода (первый блок мотивационной), «не педалировать заучивание терминов», адаптация под регион/состав семей, ≥3 из 5 видов деятельности в основной части.
  - **`ScenarioContent`** + опц. поля `metaResults` (УУД), `subjectResults`, `subject`, `literacyKind`. Триада результатов ФГОС (личностные + метапредметные + предметные) теперь покрыта схемой для всех типов; whitelist личностных по каталогу — только для `rov`/`event`.
  - **Каталог личностных результатов** расширен: добавлено 9-е направление «Адаптация к изменяющимся условиям» для ООО/СОО (НОО нормативно не предусматривает). `gradeToRovGroup(1-2/3-4/5-7/8-9/10-11/СПО)` для возрастной адаптации РоВ-промпта.
  - **UI:** двухшаговый wizard `/app/new` (карточки 5 типов → форма под тип; источник темы из плана/календаря добавляет `?type=rov` по умолчанию). Редактор адаптивно лейблит главный классификатор; новые Card'ы «Метапредметные»/«Предметные результаты». Библиотека получила фильтр-селект типа (дефолт «Все типы») и бейджи на карточках. Экспорт PDF/DOCX — первая строка шапки «Тип занятия», блок «Направление воспитания» подменяется на «Предмет» / «Вид грамотности» или скрывается для кружка; добавились опц. блоки метапредметных и предметных результатов.
  - **Pre-match** — hard-фильтр по `lesson_type` (нельзя подсунуть РоВ-сценарий под форму кружка). `useSharedAsIsAction`/`copy`/`share-target` переносят `lesson_type`. **RAG retrieve** — пока без фильтра по типу (свои корпуса для функграма/предметки — backlog).
  - **Качество** (`checkBlock`/`checkScenario`): РоВ-инварианты («Учитель:»-ритм, ≥3 вопроса в discussion, длины реплик/вопросов) применяются только для `rov`/`event`. Для `krujok`/`literacy`/`subject_extension` — мягкий порог длины шага (≥`MIN_STEP_CHARS` деф.200). Калибровка не-РоВ порогов на живых прогонах — техдолг.
  - **`scenarios.direction`** оставлен `NOT NULL`: для `subject_extension` пишется значение `subject`, для `literacy` — лейбл `literacyKind`, для `krujok` — placeholder (`'—'`). Осознанный компромисс ради совместимости с админ-статистикой.
  - **Backfill:** существующие записи `scenarios`/`shared_scenarios` через DEFAULT → `'rov'`. Для `rag_documents` — одноразовый `pnpm backfill:rag-type`.
  - Гейты: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec biome check`, `pnpm build` зелёные. **Деплой требует `db:migrate`** (миграция 0014; сервис `migrate` применит при `docker compose up -d --build`). После деплоя — прогнать `pnpm backfill:rag-type` на проде.
  - **НЕ выполнено (ручной UAT перед мержем, требует живого GigaChat):** прогон по одной генерации на каждый тип — kружок («Робототехника Arduino, 5 класс, мастер-класс»), literacy (math, «Оптимальный маршрут, 7 класс»), subject_extension («Физика — сила трения, 8 класс, эксперимент»), event («День знаний, 6 класс, праздник»), РоВ-регресс («Дружба, 5 класс, беседа, Духовно-нравственное») — сверить с baseline по объёму/качеству.
  - **Технический долг:** калибровка качественных порогов для не-РоВ типов; soft-фильтр RAG по `lesson_type` после появления профильных корпусов; whitelist метапредметных и предметных результатов по ФГОС-каталогу; маркетинг лендинга под новые типы.
```

- [ ] **23.5.** Финальный commit:

```bash
git add lib/changelog.ts CLAUDE.md
git commit -m "docs: changelog v1.9.0 + CLAUDE.md — расширение типов занятий"
```

- [ ] **23.6.** Сообщи пользователю: **готово к ручному UAT** (см. список в CLAUDE.md). Деплой = `git pull && pnpm db:migrate && pnpm backfill:rag-type && docker compose up -d --build`.

---

## Финальные гейты всего плана

После Task 23 на HEAD ветки:

- `pnpm test` — все юнит-тесты зелёные, новых ~30+ кейсов.
- `pnpm exec tsc --noEmit` — типы зелёные.
- `pnpm exec biome check` — наши изменённые файлы чисты.
- `pnpm build` — сборка проходит, роуты `/app/new`, `/app/library`, `/app/scenarios/[id]`, `/api/generate/stream` в выводе.
- Миграция 0014 применена; `pnpm backfill:rag-type` отработал идемпотентно.
- Существующий РоВ-сценарий открывается, экспортируется и регенерируется без падений.
- Wizard на `/app/new` показывает 5 карточек; каждый тип проходит до сервера без zod-ошибок при корректных входах.

Что НЕ входит в этот план (см. §15 спеки): свои RAG-корпуса для не-РоВ типов, whitelist метапредметных/предметных, подтипы функграма как UI-поле, маркетинг лендинга, калибровка качественных порогов после UAT.
