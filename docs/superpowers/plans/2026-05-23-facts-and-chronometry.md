# Фактологичность (#23) + ролевой пол хронометража (#24) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Снизить риск выдуманных фактов (промпт-сдержанность + честный баннер/дисклеймер) и сделать хронометраж реалистичным (гарантированный пол ≥3 мин на этап).

**Architecture:** #23 — правило в `buildBlockMessages` + неблокирующий баннер в редакторе + дисклеймер в экспортном документе. #24 — переписать `normalizeChronometry` на «пропорция → пол → добор до суммы» (минимальная правка валидных входов, гарантия пола и точной суммы).

**Tech Stack:** Next.js 15, TypeScript, Vitest, GigaChat, zod.

**Спека:** `docs/superpowers/specs/2026-05-23-facts-and-chronometry-design.md`
**Базис:** ветка от `master`. Конвенции CLAUDE.md: один коммит на задачу; TDD для чистой логики; гейты зелёные (`pnpm test`, `pnpm lint`, `tsc --noEmit`, `pnpm build`); UI на русском.

---

## Карта файлов
- `lib/scenario/normalize.ts` — **modify (rewrite)**: ролевой пол (#24).
- `lib/scenario/prompt.ts` — **modify**: правило про факты в `buildBlockMessages` + `PROMPT_VERSION` (#23).
- `lib/export/document-model.ts` — **modify**: дисклеймер-абзац в конце (#23).
- `app/app/scenarios/[id]/editor.tsx` — **modify**: постоянный баннер (#23).
- Тесты: `tests/lib/scenario/normalize.test.ts` (modify — добавить кейсы пола), `tests/lib/scenario/prompt.test.ts` (modify — правило фактов), `tests/lib/export/document-model.test.ts` (modify — дисклеймер).

**НЕ трогаем:** контракт `ScenarioContent`, БД (без миграций), legacy `buildMessages`/`buildSkeletonMessages`, гейт качества.

---

## Task 1: Ролевой пол хронометража (#24)

**Files:**
- Modify (rewrite): `lib/scenario/normalize.ts`
- Modify: `tests/lib/scenario/normalize.test.ts`

- [ ] **Step 1: Добавить падающие тесты на пол**

В `tests/lib/scenario/normalize.test.ts` ДОБАВИТЬ внутри `describe('normalizeChronometry', ...)` (после существующих тестов, перед закрытием `})`):

```typescript
  it('поднимает тонкую рефлексию до пола даже когда сумма уже равна target', () => {
    // [14,5,1] сумма=20=target, но рефлексия 1 мин — раньше не срабатывало
    const { content: out, changed } = normalizeChronometry(content([14, 5, 1]), 20)
    const dur = out.stages.map((s) => s.duration_min)
    expect(changed).toBe(true)
    expect(dur.every((d) => d >= 3)).toBe(true)
    expect(dur.reduce((a, d) => a + d, 0)).toBe(20)
    expect(dur[dur.length - 1]).toBeGreaterThanOrEqual(3) // рефлексия
  })

  it('держит пол 3 мин на каждом этапе при перекошенном входе (20 мин / 3 этапа)', () => {
    const { content: out } = normalizeChronometry(content([1, 18, 1]), 20)
    const dur = out.stages.map((s) => s.duration_min)
    expect(dur.every((d) => d >= 3)).toBe(true)
    expect(dur.reduce((a, d) => a + d, 0)).toBe(20)
    // основная часть остаётся самой длинной
    expect(Math.max(...dur)).toBe(dur[1])
  })
```

(Существующие 5 тестов ДОЛЖНЫ остаться зелёными — новый алгоритм минимально правит валидные входы: `[5,20,5]/30` остаётся `[5,20,5]` changed=false, и т.д.)

- [ ] **Step 2: Запустить — новые упадут**

Run: `pnpm exec vitest run tests/lib/scenario/normalize.test.ts`
Expected: 2 новых FAIL (рефлексия 1 мин не поднимается / floor 1), 5 старых — проверить, что проходят на текущем коде (да).

- [ ] **Step 3: Переписать `lib/scenario/normalize.ts`**

Заменить весь файл на:

```typescript
import type { ScenarioContent } from './schema'

// Пол длительности этапа (мин). Целевой 3, но не выше равной доли — чтобы влезало
// и в короткие занятия. Настраивается через env.
const MIN_STAGE_MINUTES = Number(process.env.MIN_STAGE_MINUTES ?? 3)

export function normalizeChronometry(
  content: ScenarioContent,
  targetMin: number,
): { content: ScenarioContent; changed: boolean } {
  const stages = content.stages
  const n = stages.length
  const current = stages.reduce((a, s) => a + s.duration_min, 0)

  // floor*n ≤ targetMin гарантировано: floor ≤ ⌊targetMin/n⌋.
  const floor = Math.max(1, Math.min(MIN_STAGE_MINUTES, Math.floor(targetMin / n)))

  const raw =
    current > 0
      ? stages.map((s) => (s.duration_min / current) * targetMin)
      : stages.map(() => targetMin / n)

  // Пропорция → пол.
  const durations = raw.map((v) => Math.max(floor, Math.floor(v)))

  // Добор до точной суммы: +1 по кругу; −1 только у этапов выше пола.
  let diff = targetMin - durations.reduce((a, v) => a + v, 0)
  let i = 0
  let guard = 0
  while (diff !== 0 && guard < 100000) {
    const idx = i % n
    if (diff > 0) {
      durations[idx] += 1
      diff -= 1
    } else if (durations[idx] > floor) {
      durations[idx] -= 1
      diff += 1
    }
    i += 1
    guard += 1
  }

  const changed = durations.some((d, idx) => d !== stages[idx].duration_min)
  if (!changed) return { content, changed: false }
  const newStages = stages.map((s, idx) => ({ ...s, duration_min: durations[idx] }))
  return { content: { ...content, stages: newStages }, changed: true }
}
```

- [ ] **Step 4: Запустить — всё зелёное**

Run: `pnpm exec vitest run tests/lib/scenario/normalize.test.ts`
Expected: все тесты PASS (5 старых + 2 новых). Если старый «scales down» даёт другой раскид но total=30 — проверить, что ассерты про total/changed выполняются (они про сумму и флаг, не про точные значения).

- [ ] **Step 5: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add lib/scenario/normalize.ts tests/lib/scenario/normalize.test.ts
git commit -m "fix(normalize): ролевой пол ≥3 мин на этап + пол при current==target (#24)"
```

---

## Task 2: Правило про факты в промпте (#23)

**Files:**
- Modify: `lib/scenario/prompt.ts`
- Modify: `tests/lib/scenario/prompt.test.ts`

- [ ] **Step 1: Добавить падающий тест**

В `tests/lib/scenario/prompt.test.ts` в блок `describe('buildBlockMessages', ...)` добавить тест:

```typescript
  it('инструктирует не выдумывать факты', () => {
    const msgs = buildBlockMessages(
      skeletonInputT4,
      skeletonT4,
      skeletonT4.stages[0],
      { type: 'discussion', focus: 'что значит быть настоящим другом' },
      [],
      '',
    )
    const sys = msgs[0].content
    expect(sys).toContain('НЕ выдумывай')
  })
```

(`skeletonInputT4`/`skeletonT4` уже определены в этом файле из предыдущей фазы — переиспользовать. Если имена иные — взять существующие фикстуры buildBlockMessages-блока.)

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm exec vitest run tests/lib/scenario/prompt.test.ts`
Expected: новый тест FAIL (правила пока нет).

- [ ] **Step 3: Добавить правило + bump версии**

В `lib/scenario/prompt.ts`:

(a) Bump `PROMPT_VERSION` (строка 4):
```typescript
export const PROMPT_VERSION = 'v7-facts-2026-05-23'
```

(b) В `buildBlockMessages`, в массиве `system`, добавить три строки СРАЗУ ПОСЛЕ строки `'Раскрывай ИМЕННО фокус этого блока, не дублируй то, что уже было в предыдущих блоках.'` и ПЕРЕД `'Отвечаешь строго JSON одного блока, без markdown. Без реальных имён детей.'`:

```typescript
    'ФАКТЫ: НЕ выдумывай конкретные факты — даты, имена реальных людей, цитаты, статистику, точные названия —',
    'которых нет в методичках выше ([RELEVANT_METHODOLOGY]). Нужен пример — подавай его как гипотетический',
    '(«представим…», «например, кто-то мог бы…»), а не как достоверный факт. Лучше общая формулировка, чем выдуманная точность.',
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm exec vitest run tests/lib/scenario/prompt.test.ts`
Expected: PASS (новый + существующие).

- [ ] **Step 5: Commit**

```bash
git add lib/scenario/prompt.ts tests/lib/scenario/prompt.test.ts
git commit -m "feat(prompt): запрет выдумывать факты без опоры на RAG (v7, #23)"
```

---

## Task 3: Дисклеймер в экспортном документе (#23)

**Files:**
- Modify: `lib/export/document-model.ts`
- Modify: `tests/lib/export/document-model.test.ts`

- [ ] **Step 1: Добавить падающий тест**

В `tests/lib/export/document-model.test.ts` добавить тест (внутри `describe('buildScenarioDocument', ...)`):

```typescript
  it('добавляет дисклеймер об ИИ в конец документа', () => {
    const blocks = buildScenarioDocument(sample, meta)
    const last = blocks[blocks.length - 1]
    expect(last.type).toBe('paragraph')
    expect('text' in last && last.text).toContain('сгенерирован ИИ')
  })
```

(`sample` и `meta` — существующие фикстуры в этом файле; если названы иначе, взять те, что используются в соседних тестах, напр. в тесте «начинается с заголовка». Проверить имена перед написанием.)

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm exec vitest run tests/lib/export/document-model.test.ts`
Expected: новый тест FAIL (последний блок — «Адаптация», не дисклеймер).

- [ ] **Step 3: Добавить блок-дисклеймер**

В `lib/export/document-model.ts`, в функции `buildScenarioDocument`, ПЕРЕД `return blocks` (после блоков «Адаптация», строки ~79-81) добавить:

```typescript
  blocks.push({
    type: 'paragraph',
    text: 'Сценарий сгенерирован ИИ-сервисом и может содержать неточности. Проверьте факты перед проведением занятия.',
  })
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm exec vitest run tests/lib/export/document-model.test.ts`
Expected: PASS (новый + существующие).

- [ ] **Step 5: Commit**

```bash
git add lib/export/document-model.ts tests/lib/export/document-model.test.ts
git commit -m "feat(export): дисклеймер об ИИ в конце PDF/DOCX (#23)"
```

---

## Task 4: Баннер в редакторе (#23)

**Files:**
- Modify: `app/app/scenarios/[id]/editor.tsx`

- [ ] **Step 1: Добавить постоянный баннер**

Прочитать `app/app/scenarios/[id]/editor.tsx`. Найти начало возвращаемой разметки — `return (` и сразу за ним `<div className="mx-auto max-w-3xl space-y-6 pb-24">` (≈ строка 119), под которым идёт условный блок `{piiWarning && (...)}`.

ДОБАВИТЬ постоянный баннер ПЕРВЫМ дочерним элементом этого `<div>` (перед `{piiWarning && ...}`):

```tsx
        <div className="rounded-md bg-warm-50 px-4 py-3 text-sm text-warm-700 ring-1 ring-warm-200">
          ⚠ Сценарий создан ИИ. Перед уроком проверьте факты — даты, имена, цитаты, числа.
        </div>
```

(Стиль скопирован с существующего `piiWarning`-баннера — те же токены `warm`. Баннер статический, всегда виден.)

- [ ] **Step 2: Гейты**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: чисто; страница `/app/scenarios/[id]` собирается.

- [ ] **Step 3: Commit**

```bash
git add app/app/scenarios/[id]/editor.tsx
git commit -m "feat(ui): баннер «проверьте факты» в редакторе сценария (#23)"
```

---

## Task 5: Финальная сверка + статус-доки

**Files:**
- Modify: `CLAUDE.md`, `docs/backlog.md`

- [ ] **Step 1: Полный гейт**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: всё зелёное (277+ тестов).

- [ ] **Step 2: Обновить `docs/backlog.md`**

Пометить #23 и #24 как ✅ ГОТОВО с пояснением: #23 — правило в `buildBlockMessages` (v7) + баннер в редакторе + дисклеймер в экспорте; #24 — `normalizeChronometry` с полом ≥3 мин/этап и фиксом раннего выхода.

- [ ] **Step 3: Обновить `CLAUDE.md`**

Добавить в «Пост-milestone изменения» пункт про #23/#24 (промпт-сдержанность + баннер/дисклеймер; ролевой пол хронометража; `PROMPT_VERSION=v7-facts-2026-05-23`; без миграций).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: факты (#23) + хронометраж (#24) — статус"
```

---

## Ручные шаги (вне кода)
- **Живой UAT:** сгенерировать сценарий — проверить реалистичный тайминг (рефлексия ≥3 мин) и баннер «проверьте факты» в редакторе; экспортировать PDF/DOCX — дисклеймер в конце.

## Риски (из спеки)
- Промпт-сдержанность снижает, но не устраняет галлюцинации — потому и баннер/дисклеймер (честность). Осознанно.
- `normalize.ts` зовут и генерация, и регенерация — контракт функции не меняется, покрыто тестами.
- Без миграций.
