# Бейдж дневной квоты + очередь к GigaChat

**Дата:** 2026-05-30
**Контекст:** в `CLAUDE.md` backlog не зафиксирован вывод квоты пользователю; #33 (семафор) и #34 (очередь к GigaChat) — в бэклоге, но не реализованы. Эта спека покрывает обе фичи единым релизом.

## Цели
1. Пользователь видит, сколько у него осталось генераций на сегодня (без необходимости упереться в 429).
2. Параллельные генерации не получают 429 от GigaChat: вторая+ ждёт свободный слот в честной FIFO-очереди и видит свою позицию.
3. Админы (`users.role='admin'`) не имеют дневного лимита и не видят бейдж.

## Не-цели (YAGNI)
- Распределённый семафор/очередь (прод — один Node-процесс).
- Приоритеты в очереди.
- Поллинг квоты в реальном времени (хватит свежего серверного рендера на навигации).
- Изменение хранилища квоты (используем существующую `rate_buckets`).
- Закрытие #58 (атомарность check-then-act `checkRateLimit`) — отдельная задача.
- og-image, история версий и прочие пункты #30/#46.

---

## Часть А — Бейдж квоты

### Источник данных
- Лимит: `MAX_GENERATIONS_PER_DAY` (деф. 10), окно `windowMs=86_400_000`, ключ `'generate'` (как в `app/api/generate/stream/route.ts`).
- Использование: новая read-only функция `getDailyGenerationUsage(userId, email, role)` в `lib/ratelimit/usage.ts`:
  - Если `role==='admin' || isWhitelisted(email, process.env.DEMO_USER_EMAILS)` → `{ unlimited: true }`.
  - Иначе `ws = windowStartFor(now, 86_400_000)`, читаем `rate_buckets.count` через `dbStore.current('generate', userId, ws)`, возвращаем
    `{ unlimited: false, used, limit, remaining: max(0, limit-used), resetAt: new Date(ws.getTime() + 86_400_000) }`.
- Хелпер не делает `cleanup`/`increment` — чистое чтение, без побочных эффектов.

### Whitelist админов
- `lib/ratelimit/index.ts` `RateCheck` получает опциональное поле `bypass?: boolean`. Если `bypass===true` → `checkRateLimit` возвращает `{ allowed:true, remaining: Infinity, retryAfterSec:0 }` (та же ветка, что для DEMO-email).
- `app/api/generate/stream/route.ts` передаёт `bypass: session.user.role === 'admin'`.
- Существующий whitelist `DEMO_USER_EMAILS` оставлен как есть (бэк-совместимо).
- Прочие `checkRateLimit`-вызовы (login, upload, export, search, regenerate, copy, prematch, material, share-export) не трогаем — у них admin-байпас не нужен на этом релизе.

### UI
- `components/nav/QuotaBadge.tsx` — server-компонент. Аргументы: `{ usage: ReturnType<getDailyGenerationUsage> }`. Состояния:
  - `unlimited` → бейдж «∞», `title="Без лимита генераций"`, классы `bg-accent-100 text-accent-800`.
  - `remaining > 3` → `«N/10»`, `bg-neutral-100 text-neutral-700`.
  - `1 ≤ remaining ≤ 3` → `«N/10»`, `bg-warm-100 text-warm-800`.
  - `remaining === 0` → `«0/10»`, `bg-red-100 text-red-700`.
  - `title` (не tooltip-компонент, нативный) для не-unlimited: `«Осталось N из 10 генераций. Сброс в HH:MM»`, где время — `resetAt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })`.
- `components/nav/AppNavbar.tsx`: бейдж между `userName/email` и формой «Выйти». Layout прокидывает уже подсчитанный `usage` в навбар (вычисляется в `app/app/layout.tsx` рядом с `auth()`).

### Свежесть бейджа
- Не поллим. Бейдж обновляется на любом server-render (навигации `next/link`). После успешной генерации UI делает `router.push('/app/scenarios/[id]')` — навбар пере-рендерится с актуальным значением.
- Допустим лёгкий лаг: если пользователь стоит на статичной странице — бейдж не «тикает».

### Тесты (TDD)
- `tests/lib/ratelimit/usage.test.ts`:
  - admin → unlimited.
  - whitelist email → unlimited.
  - нет записи в `rate_buckets` → `used=0, remaining=limit`.
  - `used=3` при `limit=10` → `remaining=7`, `resetAt = ws + 86_400_000`.
  - инъекция `now` и `store` (как в существующих тестах ratelimit).
- `tests/lib/ratelimit/check.test.ts` — добавить кейс `bypass:true` → `allowed:true, remaining:Infinity, retryAfterSec:0`, store не вызывается.

---

## Часть Б — Очередь к GigaChat

### Модуль `lib/gigachat/concurrency.ts`
Публичное API:

```ts
export type QueueOptions = {
  onQueued?: (position: number) => void   // вызывается при постановке И при каждом сдвиге
  signal?: AbortSignal                     // снятие из очереди при отмене (клиент закрыл SSE)
}

export class QueueOverflowError extends Error {}   // длина очереди превысила GIGACHAT_QUEUE_MAX
export class QueueTimeoutError extends Error {}    // истёк GIGACHAT_QUEUE_TIMEOUT_MS в очереди

export function withGigaChatSlot<T>(fn: () => Promise<T>, opts?: QueueOptions): Promise<T>
```

### Поведение
- Семафор `N = Number(process.env.GIGACHAT_MAX_CONCURRENCY ?? '1')`.
- FIFO-очередь ожидающих. Если занято N слотов и длина очереди ≥ `GIGACHAT_QUEUE_MAX` (деф.10) → бросаем `QueueOverflowError` синхронно (до старта таймера).
- Иначе встаём в конец, **сразу** зовём `opts.onQueued(position)` где `position = queueIndex + 1` (1-based).
- При каждом освобождении слота FIFO-фронт получает слот; **для всех оставшихся** в очереди зовём `onQueued(newPosition)`.
- Таймаут `GIGACHAT_QUEUE_TIMEOUT_MS` (деф. `300_000`): запускается при постановке; если истёк до получения слота — снимаем из очереди и `reject(QueueTimeoutError)`.
- `signal.aborted` → снимаем из очереди (без вызова `fn`), `reject(signal.reason ?? AbortError)`.
- Когда слот получен → выполняем `fn()` (даже если signal сработал позже — операция уже стартанула, fn сам решит, реагировать или нет).
- `finally` — освобождаем слот, продвигаем очередь.
- In-memory state в модуле (singleton). Для тестов — экспортируем `__resetForTests()` (NODE_ENV-guard).

### Куда вставляем
Все `fetch` к GigaChat-API (chat и embeddings; OAuth — нет):
- `lib/gigachat/client.ts` `chatCompletion(...)` → внутри обернуть тело в `withGigaChatSlot(() => fetch(...))`. То же для `chatCompletionStream(...)` — оборачивается тело **до возврата reader'a** (слот удерживается до конца стрима — иначе следующий запрос пойдёт параллельно текущему стриму и упрётся в 429 GigaChat). Для стрима возврат из `withGigaChatSlot` — это `Promise`, который резолвится **после полного дренажа** ридера; реализуем через явное закрытие слота в `finally` async-генератора.
- `lib/gigachat/embeddings.ts` `embed(...)` — обернуть внутренний батч-цикл (один батч = один вызов `withGigaChatSlot`).

### Прокидывание `onQueued` в SSE
- `lib/scenario/stream.ts` `streamScenario(input, deps)` — `deps.gigachat` сейчас инъекция чат-клиента. Добавляем опциональный коллбэк в стримящий генератор: при первом вызове GigaChat-функции (`embed` или skeleton-stream) передаём `onQueued`, который **через генератор эмитит `{type:'queued', position}` пользователю**.
- Реализация: в `streamScenario` создаём локальный `let queueListener: (n:number)=>void = noop` и оборачиваем все вызовы к `embed/chat` фабрикой, которая ставит `onQueued: (n) => queueListener(n)`. Перед первым вызовом подменяем `queueListener` на функцию, которая `yield { type:'queued', position:n }` через очередь событий стрима. После первого `phase`-события `queueListener` сбрасывается в noop (далее ждать всё равно придётся, но UI уже показывает прогресс — повторно не путаем).
- Альтернатива (проще): передавать `onQueued` только в самый первый вызов (RAG embed) — почти всегда это первый «затык». Принимаем эту версию, она проще и реальный кейс покрывает.

### UI `components/generation/GenerationStream.tsx`
Новый случай в редьюсере SSE-событий:
- `event.type === 'queued'` → state `phase: 'queued', queuePosition: event.position`. Рендер: блок «⏳ Вы N-й в очереди. Подождите, пожалуйста…» (анимация `animate-pulse`), вместо прогресс-баров фаз.
- Любое последующее `phase` — переключение на штатный прогресс.
- На `QueueOverflowError`/`QueueTimeoutError` сервер возвращает структурированный `error`-event с `code: 'queue_overflow' | 'queue_timeout'`, фронт показывает соответствующее сообщение («Сервис перегружен, попробуйте через минуту» / «Очередь не освободилась за 5 минут, попробуйте позже»).

### Не-стримящие вызовы
- `regenerateActivityAction`, `useSharedAsIsAction`, `prematchAction`, `embed` из `/app/library` поиска: автоматически попадают под семафор через обёртки в `client.ts/embeddings.ts`, **без UI-индикатора позиции** (они и сейчас показывают спиннер, которого достаточно). `onQueued` не передаём → молча ждут.

### Конфигурация
- `.env.example`: новые ключи
  - `GIGACHAT_MAX_CONCURRENCY=1` (на новом тарифе поднять до `5`).
  - `GIGACHAT_QUEUE_MAX=10`.
  - `GIGACHAT_QUEUE_TIMEOUT_MS=300000`.

### Тесты (TDD)
- `tests/lib/gigachat/concurrency.test.ts` с фейковым таймером (`vi.useFakeTimers()`):
  - N=1: первый идёт сразу, второй ждёт, `onQueued(1)` сработал.
  - При завершении первого — второй получает слот, `onQueued` второго НЕ вызывается повторно (он уже стартовал); третий, если был — получает `onQueued(1)`.
  - `QueueOverflowError` бросается при превышении длины (до запуска таймера).
  - `QueueTimeoutError` бросается после `GIGACHAT_QUEUE_TIMEOUT_MS`, элемент удалён из очереди, остальные сдвигаются.
  - AbortSignal до получения слота → запрос снят, `fn` НЕ вызван.
  - N=2: два запроса параллельно, третий ждёт.
  - `__resetForTests()` между кейсами.

### Семантика admin/whitelist
- Очередь — про физический лимит GigaChat. **Никаких байпасов:** админ ждёт в очереди как все. Бейпасится только дневная пользовательская квота (часть А).

---

## Изменения по файлам (карта)

| Файл | Что |
| --- | --- |
| `lib/ratelimit/index.ts` | Добавить `bypass?: boolean` в `RateCheck` + ранний return |
| `lib/ratelimit/usage.ts` | **NEW** `getDailyGenerationUsage(userId, email, role)` |
| `app/api/generate/stream/route.ts` | Передавать `bypass: role==='admin'` в `checkRateLimit` |
| `app/app/layout.tsx` | Считать `usage`, прокинуть в `AppNavbar` |
| `components/nav/AppNavbar.tsx` | Принимать `usage`, рендерить `<QuotaBadge>` |
| `components/nav/QuotaBadge.tsx` | **NEW** компонент бейджа |
| `lib/gigachat/concurrency.ts` | **NEW** семафор + очередь |
| `lib/gigachat/client.ts` | Обернуть `chatCompletion`/`chatCompletionStream` в `withGigaChatSlot` |
| `lib/gigachat/embeddings.ts` | Обернуть батч в `withGigaChatSlot` |
| `lib/scenario/stream.ts` | Эмит `{type:'queued', position}` (см. альтернативу — только перед первым вызовом) |
| `components/generation/GenerationStream.tsx` | Обработка `queued`, overflow/timeout |
| `.env.example` | `GIGACHAT_MAX_CONCURRENCY`, `GIGACHAT_QUEUE_MAX`, `GIGACHAT_QUEUE_TIMEOUT_MS` |
| `lib/changelog.ts` | Запись v1.x: «Показываем оставшуюся квоту и ставим параллельные генерации в очередь» |

**Миграций нет.**

## Гейты до коммита
- `pnpm test` (новые usage/concurrency/check тесты зелёные, регрессий нет).
- `tsc --noEmit`, `pnpm lint`, `pnpm build`.
- Ручной UAT перед мержем:
  1. Залогиниться обычным юзером → бейдж `10/10`. Запустить генерацию → после завершения `9/10`. Tooltip показывает время сброса.
  2. Установить `MAX_GENERATIONS_PER_DAY=1` локально, израсходовать → бейдж `0/10` красный, новая генерация → 429.
  3. Залогиниться админом → бейдж `∞`. Лимит не срабатывает.
  4. Открыть две вкладки от разных юзеров, обе запустить генерацию одновременно. Вторая показывает «Вы 2-й в очереди», после завершения первой — переключается на прогресс-бар.
  5. Открыть 11 параллельных запросов — 11-й сразу получает «Сервис перегружен».

## Риски и грабли
- **Утечка слота**: если в обёртке chat-stream `finally` не сработает (await на ридере проброшен наружу до закрытия) — слот зависнет навечно. Решение — реализовать через async-генератор, где `finally` гарантирован при любом исходе (return/throw/break вызывающего).
- **Слишком частые `onQueued`-апдейты** на пустую очередь → шум в SSE. Эмитим только при реальной смене позиции.
- **Глобальный singleton** очереди — корректен в dev-режиме Next.js с HMR? Да: модуль кэшируется по пути. В тестах сбрасываем `__resetForTests()`.
- **Прод на одном Node-процессе**: гарантировано (один контейнер `app` в `docker-compose.yml`). Если в будущем — горизонтальное масштабирование, очередь надо вынести в Redis (отметить в backlog).
