# Admin-панель статистики — Design

**Date:** 2026-05-20
**Status:** Approved (brainstorming) → ready for implementation planning
**Контекст:** проект «Классный час» (см. CLAUDE.md). Фаза после demo-readiness. Запрос: админ-панель со статистикой использования для бизнеса.

---

## 1. Цель

Дать администратору одну страницу `/app/admin` с ретроспективной статистикой использования сервиса: объём генераций, популярные темы/классы/форматы, пользователи, активность сообщества, плюс события (экспорты/логины/поиск). Только чтение, агрегаты по всем пользователям.

## 2. Ограничения и решения (зафиксированы в брейншторме)

- **Доступ — поле `role` у `users`** (`'user' | 'admin'`), не env-whitelist.
- **Все 4 блока статистики** + блок событий.
- **Визуализация — карточки + таблицы + лёгкие CSS-bar'ы** (без chart-библиотек; RAM-бюджет 4 ГБ).
- **Подход A + events-лог** — статистика считается из существующих таблиц (история уже копится через `created_at`), плюс новая таблица `events` для эфемерных метрик (экспорт/логин/поиск), которых раньше не было нигде кроме `rate_buckets` (24ч).
- Изоляция по `user_id` — намеренное исключение для admin-агрегатов, защищённое role-гардом и сосредоточенное в одном модуле `lib/admin/stats.ts`. Все остальные правила CLAUDE.md в силе.
- UI на русском, стиль строго из `design_example/`.

## 3. Авторизация (роли)

- Миграция `0009`: `ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user'` (+ создание таблицы `events`, см. §5). Существующие юзеры получают `'user'`.
- `db/schema.ts`: добавить `role` в `users`.
- `auth.ts`: в `jwt`-callback класть `token.role` (читать из БД при логине или из user-объекта), в `session`-callback — `session.user.role`. Расширить augmentation типа `Session.user` полем `role: string`.
- **Гард доступа:** `app/app/admin/page.tsx` (server component) — `const session = await auth(); if (session?.user?.role !== 'admin') redirect('/app')`. Те же проверки в любых admin server-actions. (Middleware не трогаем — он гейтит только аутентификацию `/app/*`; роль-гард на уровне страницы проще и достаточно.)
- **Назначение админа:** `scripts/set-admin.ts <email>` — ставит `role='admin'` по email, идемпотентный, ручной прогон (`pnpm set:admin`). Без UI управления ролями (YAGNI).

## 4. Блоки статистики

Модуль `lib/admin/stats.ts` — набор функций, каждая возвращает типизированный результат для своей секции. Агрегаты по всем пользователям (НЕ scoped — admin видит всё). Реализация — Drizzle/`sql` агрегатные запросы. Каждая функция инъектирует `db` для тестируемости, как в `lib/calendar/events.ts`.

1. **Генерации** (`generations`):
   - `total`, `okCount`, `errorCount`, `successRate` (% ok), `avgLatencyMs` (только где `latency_ms` не null — пометка в UI, что в стрим-режиме часть пустая).
   - `byDay`: последние 30 дней — `{ day, count }` (group by `date(created_at)`).
2. **Контент** (`scenarios`):
   - `topTopics`: топ-10 `{ topic, count }`.
   - `byDirection`, `byGrade`, `byFormat`, `byDuration`: `{ key, count }[]` (group by соответствующей колонке).
3. **Пользователи** (`users`, `generations`):
   - `totalUsers`, `newByDay` (30д), `activeUsers` (distinct `user_id` в `generations` за 30д), `topUsers`: топ-10 `{ email, count }` (join `users` по `user_id`).
4. **Сообщество** (`likes`, `shared_scenarios`, `plan_topics`):
   - `totalLikes`, `totalShared`, `topShared`: топ-10 `{ topic, likeCount }` по `like_count`.
   - `planCoverage`: `{ closed, total }` тем по всем планам (закрыто = темы с привязанным сценарием; считаем по наличию связи, как на странице планов).

## 5. Events-лог (экспорты/логины/поиск)

- Миграция `0009` создаёт таблицу `events`:
  ```sql
  events (
    id text pk default randomUUID,
    user_id text null references users(id) on delete set null,
    type text not null,            -- 'export' | 'login' | 'search'
    meta jsonb null,               -- {format} | {} | {query}
    created_at timestamptz not null default now()
  )
  -- index events_type_created_idx on (type, created_at)
  ```
- `lib/events/log.ts` → `logEvent(type: EventType, opts: { userId?: string|null; meta?: Record<string,unknown> }): Promise<void>` — **best-effort**: оборачивает insert в try/catch, никогда не бросает (по образцу best-effort вставок в `generations`). `EventType = 'export' | 'login' | 'search'`.
- **Точки эмита:**
  - **export** — в `app/api/scenarios/[id]/export/route.ts` после успешной отдачи (или прямо перед `return`), `meta: { format }`, `userId`.
  - **login** — в login server-action после успешного `signIn`, `meta: {}`, `userId` (если доступен; иначе по email-lookup). Только успешные логины (неуспешные не логируем — приватность/шум).
  - **search** — в `app/app/library/actions.ts` (search action) после валидного запроса, `meta: { query }`. Поисковые запросы = темы занятий, не ПДн — храним как есть.
- **Блок «События»** в админке (`eventStats(db)`): счётчики по `type` за 30д, топ-10 поисковых запросов (`type='search'`, group by `meta->>'query'`), сплит экспортов по `meta->>'format'`. История копится с момента внедрения — на демо данных будет мало, отметить в UI («данные собираются с …»).

## 6. UI / страница

- `app/app/admin/page.tsx` (server): role-гард → `Promise.all` всех stats-функций → рендер секций.
- `components/admin/`:
  - `KpiCard` — крупное число + подпись (карточка `ring-1 shadow-card`).
  - `BarList` — список `{ label, value }` с горизонтальными bar'ами (ширина = value/max·100%, чистый Tailwind, brand-цвет).
  - `StatTable` — простая таблица (топ тем/юзеров/расшаренных).
  - `SectionCard` — обёртка секции с заголовком (`font-display`).
- Объём: all-time KPI-карточки сверху + 30-дневные тренды (BarList по дням) + топ-таблицы/распределения. Без интерактивного date-фильтра в MVP.
- Навбар (`AppNavbar`): ссылка «Админ» → `/app/admin`, видна только если `role==='admin'` (прокинуть `role` в navbar из layout).

## 7. Тестирование

- **TDD (чистая логика):** `isAdmin(session)`-хелпер; чистые расчёты для UI — `barPercent(value, max)`, `successRate(ok, total)`; `logEvent` — юнит со стаб-`db` (как `tests/lib/calendar/events.test.ts`, без сети).
- **Smoke (живая БД):** существование таблицы `events` и колонки `users.role` (как `tests/smoke/calendar-schema.test.ts`); один прогон ключевой stats-функции на реальной БД (вернёт числа/пустые массивы — проверяем, что запрос валиден).
- Агрегатные stats-функции целиком не юнит-тестируем глубоко (это SQL), но `db` инъектируется → возможны лёгкие проверки формы результата при необходимости.
- Гейты зелёные перед каждым коммитом: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

## 8. Файловая структура

**Создаются:**
- `lib/admin/stats.ts`, `lib/admin/guard.ts` (`isAdmin`), `lib/admin/format.ts` (`barPercent`/`successRate`)
- `lib/events/log.ts`
- `app/app/admin/page.tsx`
- `components/admin/{KpiCard,BarList,StatTable,SectionCard}.tsx`
- `scripts/set-admin.ts`
- `db/migrations/0009_*.sql` (через drizzle-kit generate)
- тесты под чистую логику + smoke

**Модифицируются:**
- `db/schema.ts` (`users.role` + таблица `events`)
- `auth.ts` (role в JWT/session + тип)
- `app/api/scenarios/[id]/export/route.ts` (logEvent export)
- login server-action (logEvent login)
- `app/app/library/actions.ts` (logEvent search)
- `components/nav/AppNavbar.tsx` (ссылка «Админ» для admin) + `app/app/layout.tsx` (прокинуть role)
- `package.json` (`set:admin`), `CLAUDE.md` (статус)

## 9. Безопасность

- Admin-агрегаты доступны ТОЛЬКО при `role==='admin'` (гард на странице + в actions). Это единственная точка, читающая чужие данные — изолирована в `lib/admin/*`.
- `events.meta` для search хранит текст запроса (темы, не ПДн) — осознанное решение, отметить.
- Никаких мутаций из админки в MVP (только чтение + назначение роли через CLI-скрипт). Нет управления юзерами/удаления — вне scope.
- `logEvent` best-effort: сбой логирования не ломает экспорт/логин/поиск.

## 10. Out of scope (MVP)

- Интерактивный date-range фильтр и произвольные периоды (сейчас all-time + фикс. 30д).
- Экспорт статистики в CSV/PDF.
- Управление пользователями/ролями из UI (только CLI-скрипт).
- Реалтайм-обновление, графики через chart-библиотеки.
- Логирование неуспешных логинов, гео/устройства.
- Ретроспектива по экспортам/логинам/поиску ДО внедрения events (история только вперёд).
