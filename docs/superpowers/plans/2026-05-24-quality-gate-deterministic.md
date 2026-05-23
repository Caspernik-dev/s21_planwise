# Усиление детерминированного гейта качества (#26) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть дыры детерминированного гейта качества (#26): пустые реплики «Учитель:» и неоценённые вопросы — двумя объективными проверками в `checkBlock`, без LLM.

**Architecture:** Две новые проверки в `lib/scenario/quality.ts` `checkBlock` (содержательность каждой реплики «Учитель:» + качество каждого вопроса). Сигнатура не меняется → применяется и в генерации, и в регенерации через `generateBlockWithGate`. Тесты-фикстуры с «игрушечными» короткими вопросами (`['а?','б?','в?']`) в 4 файлах обновляются на реалистичные, иначе новый гейт их завернёт.

**Tech Stack:** TypeScript, Vitest.

**Спека:** `docs/superpowers/specs/2026-05-24-quality-gate-deterministic-design.md`
**Базис:** ветка от `master`. Конвенции CLAUDE.md: TDD; гейты зелёные; без миграций.

---

## Карта файлов
- `lib/scenario/quality.ts` — **modify**: две новые проверки в `checkBlock` + env-пороги.
- `tests/lib/scenario/quality.test.ts` — **modify**: обновить позитивную фикстуру + добавить 2 негативных теста.
- `tests/lib/scenario/block-gen.test.ts`, `tests/lib/scenario/stream.test.ts`, `tests/lib/scenario/regenerate.test.ts` — **modify**: заменить `['а?','б?','в?']` на реалистичные вопросы (иначе dense-блоки перестанут проходить гейт).
- `CLAUDE.md`, `docs/backlog.md` — **modify** (Task 3): статус #26.

**НЕ трогаем:** `checkScenario`, сигнатуру `checkBlock`, `block-gen.ts`/`stream.ts`/`regenerate.ts` (код), схему/БД.

---

## Task 1: Обновить тест-фикстуры под новый гейт

> Сделать ПЕРВЫМ: после ужесточения гейта `['а?','б?','в?']` (по 2 символа) перестанут проходить проверку вопросов. Эти фикстуры используются как ПРОХОДЯЩИЕ dense-блоки. Заменяем их заранее на реалистичные вопросы (≥15 симв., с «?»), чтобы тесты остались зелёными после Task 2.

**Files:**
- Modify: `tests/lib/scenario/block-gen.test.ts`, `tests/lib/scenario/stream.test.ts`, `tests/lib/scenario/regenerate.test.ts`, `tests/lib/scenario/quality.test.ts`

- [ ] **Step 1: Заменить игрушечные вопросы на реалистичные**

Во ВСЕХ четырёх файлах заменить вхождения `['а?', 'б?', 'в?']` на:
```typescript
['Что для тебя значит это?', 'Почему это важно сегодня?', 'Как ты поступишь в такой ситуации?']
```
Конкретные места (проверить грепом `grep -rn "'а?', 'б?', 'в?'" tests`):
- `tests/lib/scenario/block-gen.test.ts` — в объекте `DENSE_BLOCK` (поле `questions`).
- `tests/lib/scenario/stream.test.ts` — в константе `BLOCK` (поле `questions`).
- `tests/lib/scenario/regenerate.test.ts` — в ДВУХ местах (блоки `discussion` и `game` внутри `chatReturning(JSON.stringify({...}))`).
- `tests/lib/scenario/quality.test.ts` — в тесте `«плотный блок основной части проходит»` (строка с `questions: ['а?', 'б?', 'в?']`).

НЕ трогать `tests/lib/scenario/quality.test.ts` строку с `questions: ['а?']` (это негативный тест «<3 вопросов», он и должен падать).

- [ ] **Step 2: Прогнать тесты на ТЕКУЩЕМ коде (должны остаться зелёными)**

Run: `pnpm exec vitest run tests/lib/scenario/block-gen.test.ts tests/lib/scenario/stream.test.ts tests/lib/scenario/regenerate.test.ts tests/lib/scenario/quality.test.ts`
Expected: всё PASS (реалистичные вопросы не ломают текущие проверки — гейт пока считает только число вопросов; длина блоков и реплики не изменились).

- [ ] **Step 3: Commit**

```bash
git add tests/lib/scenario/block-gen.test.ts tests/lib/scenario/stream.test.ts tests/lib/scenario/regenerate.test.ts tests/lib/scenario/quality.test.ts
git commit -m "test: реалистичные вопросы в фикстурах (под ужесточение гейта #26)"
```

---

## Task 2: Две новые проверки в `checkBlock`

**Files:**
- Modify: `lib/scenario/quality.ts`
- Modify: `tests/lib/scenario/quality.test.ts`

- [ ] **Step 1: Добавить падающие негативные тесты**

В `tests/lib/scenario/quality.test.ts`, внутри `describe('checkBlock', ...)`, добавить:

```typescript
  it('пустая реплика «Учитель:» не проходит', () => {
    const r = checkBlock({ type: 'task', text: `${longText(2)}\nУчитель:  ` }, 'main')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('короткая')
  })

  it('discussion с коротким вопросом не проходит', () => {
    const r = checkBlock(
      { type: 'discussion', text: longText(3), questions: ['Что для тебя значит дружба?', 'А?', 'Почему важно дружить и помогать?'] },
      'main',
    )
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('вопрос')
  })
```

(`longText(n)` — существующий хелпер в файле: n реплik «Учитель: …» по ~300 симв. `longText(2)` ≈ 626 симв. ≥ MIN_BLOCK_CHARS, 2 полноценные реплики; добавленный `\nУчитель:  ` даёт 3-ю пустую реплику. Во втором тесте `'А?'` (2 симв.) — короткий вопрос при count=3.)

- [ ] **Step 2: Запустить — упадут**

Run: `pnpm exec vitest run tests/lib/scenario/quality.test.ts`
Expected: 2 новых FAIL (текущий `checkBlock` не проверяет содержательность реплик и качество вопросов).

- [ ] **Step 3: Реализовать проверки в `lib/scenario/quality.ts`**

(a) Добавить env-пороги после строки `const MIN_SCENARIO_CHARS = ...` (≈ строка 7):
```typescript
const MIN_TEACHER_TURN_CHARS = Number(process.env.MIN_TEACHER_TURN_CHARS ?? 40)
const MIN_QUESTION_CHARS = Number(process.env.MIN_QUESTION_CHARS ?? 15)
```

(b) Заменить тело `checkBlock` (от `const teacherTurns = ...` до `return ...`) на:
```typescript
  const isLed = stageKind === 'engage' || stageKind === 'main'
  // Реплики «Учитель:» — содержимое после каждого маркера (преамбулу [0] отбрасываем).
  const turns = text
    .split(/Учитель\s*:/)
    .slice(1)
    .map((t) => t.trim())
  if (isLed && turns.length < 2) {
    reasons.push('мало реплик «Учитель:» (нужно ≥2)')
  }
  if (isLed && turns.some((t) => t.length < MIN_TEACHER_TURN_CHARS)) {
    reasons.push('пустая или слишком короткая реплика «Учитель:»')
  }

  if (block.type === 'discussion') {
    const qs = block.questions ?? []
    if (qs.length < 3) reasons.push('мало вопросов для обсуждения (нужно ≥3)')
    if (qs.some((q) => !q.includes('?') || q.trim().length < MIN_QUESTION_CHARS)) {
      reasons.push('слишком короткий или неполный вопрос')
    }
  }

  return { ok: reasons.length === 0, reasons }
```

(Старый `const teacherTurns = (text.match(/Учитель\s*:/g) ?? []).length` и блок с `teacherTurns < 2`, а также старый блок `if (block.type === 'discussion' && (block.questions?.length ?? 0) < 3)` — удаляются, заменены кодом выше. `const text = block.text.trim()` и проверка `MIN_BLOCK_CHARS` остаются как были.)

- [ ] **Step 4: Запустить — всё зелёное**

Run: `pnpm exec vitest run tests/lib/scenario/quality.test.ts`
Expected: все PASS (2 новых негативных + существующие, включая «плотный блок проходит» с реалистичными вопросами из Task 1, и «рефлексия не требует 2 реплик» — reflection isLed=false).

- [ ] **Step 5: Полный прогон + commit**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm lint
git add lib/scenario/quality.ts tests/lib/scenario/quality.test.ts
git commit -m "feat(quality): содержательность реплик «Учитель:» и качество вопросов в гейте (#26)"
```
Expected: вся сюита зелёная (фикстуры обновлены в Task 1, поэтому dense-блоки проходят ужесточённый гейт); tsc/lint чисто.

---

## Task 3: Финальная сверка + статус-доки

**Files:**
- Modify: `CLAUDE.md`, `docs/backlog.md`

- [ ] **Step 1: Полный гейт**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: всё зелёное.

- [ ] **Step 2: Обновить `docs/backlog.md`**

Пометить #26 как ✅ ГОТОВО: усилены детерминированные проверки `checkBlock` — каждая реплика «Учитель:» ≥`MIN_TEACHER_TURN_CHARS` (не пустая), каждый вопрос discussion с «?» и ≥`MIN_QUESTION_CHARS`; без LLM-судьи, env-тюнятся.

- [ ] **Step 3: Обновить `CLAUDE.md`**

Добавить в «Пост-milestone изменения» пункт про #26: две новые детерминированные проверки в `checkBlock` (содержательность реплик + качество вопросов), env-пороги `MIN_TEACHER_TURN_CHARS`/`MIN_QUESTION_CHARS`, без LLM, без миграций; отметить, что серия улучшений качества генерации закрыта.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: усиление гейта качества — статус #26"
```

---

## Ручные шаги (вне кода)
- **Живой UAT (опц.):** сгенерировать сценарий — убедиться, что ужесточённый гейт не вызывает чрезмерных ретраев на реальном РоВ-выводе (реплики там 150-400 симв., вопросы развёрнутые — пороги 40/15 не должны срабатывать). При чрезмерных ретраях — подкрутить env вниз.

## Риски (из спеки)
- Более строгий гейт → возможны доп. ретраи на реальном выводе; деградация мягкая (берём лучшую попытку), пороги низкие и env-тюнятся.
- Фикстуры с короткими вопросами обновлены в Task 1 — иначе dense-тесты завернул бы новый гейт.
- Без миграций.
