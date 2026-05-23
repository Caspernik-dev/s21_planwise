# Мягкий фильтр направления в RAG-retrieve (#25) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестать исключать РоВ-корпус (`direction=null`, 510 чанков) из RAG-кандидатов, когда задано направление — заменить жёсткий фильтр направления на мягкий и убрать ставший избыточным fallback.

**Architecture:** В `lib/rag/retrieve.ts` `queryCandidatesLive` фильтр направления становится `(= X OR IS NULL)`; `retrieveChunks` делает один вызов кандидатов вместо «запрос → при нехватке fallback без направления». Релевантность по направлению остаётся в эмбеддинге запроса + cosine/BM25-ранжировании.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Drizzle (Postgres+pgvector).

**Спека:** `docs/superpowers/specs/2026-05-24-rag-soft-direction-design.md`
**Базис:** ветка от `master`. Конвенции CLAUDE.md: один коммит на задачу; TDD; гейты зелёные; юнит-тесты не ходят в сеть/БД (deps инъектируются).

---

## Карта файлов
- `lib/rag/retrieve.ts` — **modify**: мягкий `dirFilter` + удаление fallback.
- `tests/lib/rag/retrieve.test.ts` — **modify**: переписать тест fallback под новое поведение (один вызов кандидатов).
- `CLAUDE.md`, `docs/backlog.md` — **modify** (Task 2): статус #25.

**НЕ трогаем:** `lib/rag/score.ts` (ранжирование), ingest-скрипты, схему/БД (без миграций), `RetrieveQuery`/`RetrieveDeps` контракты.

---

## Task 1: Мягкий фильтр направления + удаление fallback

**Files:**
- Modify: `lib/rag/retrieve.ts`
- Modify: `tests/lib/rag/retrieve.test.ts`

- [ ] **Step 1: Переписать тест на новое поведение**

В `tests/lib/rag/retrieve.test.ts`:

(a) В первый тест (`embeds the query once and returns topK diversified chunks`) добавить проверку одного вызова кандидатов — после `expect(embed).toHaveBeenCalledTimes(1)` вставить строку:
```typescript
    expect(queryCandidates).toHaveBeenCalledTimes(1)
```

(b) ЗАМЕНИТЬ второй тест (`falls back to no-direction query when filtered result is smaller than topK`, строки ~31-43) целиком на:
```typescript
  it('не делает fallback-запрос: мягкий фильтр уже включает direction=null', async () => {
    const embed = vi.fn(async () => [[0.1]])
    const queryCandidates = vi.fn(async () => [row('1', 'A', 0.9, 5), row('2', 'B', 0.8, 4)])
    const out = await retrieveChunks(
      { direction: 'Гражданское', grade: 6, topic: 'дружба', lang: 'russian' },
      { embed, queryCandidates, topK: 3, maxPerDoc: 2, candidates: 24 },
    )
    expect(queryCandidates).toHaveBeenCalledTimes(1)
    expect(out.length).toBe(2)
  })
```

- [ ] **Step 2: Запустить — тест (b) упадёт**

Run: `pnpm exec vitest run tests/lib/rag/retrieve.test.ts`
Expected: новый тест (b) FAIL (`queryCandidates` вызывается 1 раз ожидается, но текущий код при <topK делает 2-й fallback-вызов → получит 2). Тест (a) — PASS.

- [ ] **Step 3: Реализовать мягкий фильтр + убрать fallback**

В `lib/rag/retrieve.ts`:

(a) В `queryCandidatesLive` заменить строку определения `dirFilter` (≈ строка 47):
```typescript
  const dirFilter = args.direction ? sql`AND chunk_meta->>'direction' = ${args.direction}` : sql``
```
на:
```typescript
  const dirFilter = args.direction
    ? sql`AND (chunk_meta->>'direction' = ${args.direction} OR chunk_meta->>'direction' IS NULL)`
    : sql``
```

(b) В `retrieveChunks` заменить блок (≈ строки 93-96):
```typescript
  let rows = await d.queryCandidates({ ...base, direction: query.direction })
  if (rows.length < d.topK && query.direction) {
    rows = await d.queryCandidates({ ...base, direction: null })
  }
```
на:
```typescript
  const rows = await d.queryCandidates({ ...base, direction: query.direction })
```

- [ ] **Step 4: Запустить — всё зелёное**

Run: `pnpm exec vitest run tests/lib/rag/retrieve.test.ts`
Expected: оба теста PASS.

- [ ] **Step 5: Гейты + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add lib/rag/retrieve.ts tests/lib/rag/retrieve.test.ts
git commit -m "fix(rag): мягкий фильтр направления — не исключать РоВ-корпус (#25)"
```
Expected: tsc чисто, lint exit 0.

---

## Task 2: Гейты, живой UAT-замер, статус-доки

**Files:**
- Modify: `CLAUDE.md`, `docs/backlog.md`

- [ ] **Step 1: Полный гейт**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: всё зелёное (279+ тестов).

- [ ] **Step 2: Живой UAT-замер (если доступна БД с RoV-корпусом)**

Если Docker-Postgres с корпусом доступен (локально или прод), проверить, что РоВ-чанки теперь попадают в выдачу при заданном направлении. Создать временный скрипт `scripts/_tmp-retrieve-check.ts`:
```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })
config()
async function main() {
  const { retrieveChunks } = await import('@/lib/rag/retrieve')
  const out = await retrieveChunks({ direction: 'Патриотическое', grade: 4, topic: 'День народного единства' })
  console.log('результатов:', out.length)
  for (const c of out) console.log('-', c.documentTitle.slice(0, 50), '| score', c.score.toFixed(3))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```
Run: `pnpm exec tsx scripts/_tmp-retrieve-check.ts`
Expected: среди `documentTitle` есть «Разговоры о важном …» (раньше для Патриотического исключались). После проверки удалить скрипт: `rm scripts/_tmp-retrieve-check.ts`.
Если БД недоступна (sandbox) — пропустить, отметить как ручной шаг в доках.

- [ ] **Step 3: Обновить `docs/backlog.md`**

Пометить #25 как ✅ ГОТОВО: мягкий фильтр направления (`= X OR IS NULL`) в `lib/rag/retrieve.ts`, fallback удалён, РоВ-корпус (direction=null) больше не исключается при заданном направлении; без миграций.

- [ ] **Step 4: Обновить `CLAUDE.md`**

Добавить в «Пост-milestone изменения» пункт про #25: причина (жёсткий фильтр исключал 510 РоВ-чанков для ~половины направлений с ≥3 seed-чанков), фикс (мягкий фильтр + удалён fallback), без миграций.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: мягкий фильтр направления RAG — статус #25"
```

---

## Ручные шаги (вне кода)
- Если живой UAT-замер в Task 2 Step 2 пропущен (нет БД) — прогнать после деплоя: убедиться, что для направлений с seed-перекосом (Патриотическое/Трудовое) РоВ-чанки теперь в выдаче.

## Риски (из спеки)
- Мягкий фильтр всегда включает РоВ-корпус в кандидаты — это цель; лимит `RAG_CANDIDATES` и диверсификация не меняются.
- Удаление fallback меняет число вызовов `queryCandidates` — покрыто тестом.
- Без миграций; деплой — обычный `git pull && docker compose up -d --build`.
