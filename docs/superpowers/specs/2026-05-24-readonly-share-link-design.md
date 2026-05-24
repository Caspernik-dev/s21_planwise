# Read-only шаринг сценария по ссылке (backlog #30, часть «а»)

**Статус:** утверждён 2026-05-24
**Источник:** `docs/backlog.md` #30 (а). Части (б) история версий и (в) og-image — ВНЕ scope, остаются в #30.

## Проблема

Учитель не может показать готовый сценарий коллеге, не входящему в систему. Сейчас сценарий
виден только владельцу под авторизацией (`/app/scenarios/[id]` с изоляцией по `user_id`).
Нужна публичная read-only ссылка: открыл — посмотрел, без входа и без копирования к себе.

## Зафиксированные решения (из брейншторма)

1. **Только read-only шаринг** (а). История версий (б) и og-image (в) — отложены.
2. **PII — как есть + предупреждение.** По ссылке показываем реальный контент (автор сам решил
   поделиться своим сценарием). При ВКЛЮЧЕНИИ ссылки автору показываем мягкое предупреждение
   «найдены ПДн» (как при сохранении), но не блокируем. Ссылка — неугадываемый токен.
3. **Публичная страница умеет:** read-only просмотр, экспорт PDF/DOCX, CTA «Создано в Planwise»
   → регистрация, и «Скопировать себе» (только для залогиненных).

## Архитектура

### Модель данных
- Новая колонка `scenarios.share_token text` — nullable, **unique**. Генерация миграции через
  `pnpm db:generate` (drizzle-kit) после правки `db/schema.ts` → файл `db/migrations/0012_*.sql`.
- Включение ссылки → пишем неугадываемый токен; отзыв → `share_token = NULL` (одна ссылка на
  сценарий, отдельная таблица не нужна). Множественные `NULL` в unique-колонке Postgres допускает.

### `lib/share/token.ts` (новый, TDD)
- `generateShareToken(): string` — `crypto.randomBytes(24)` → base64url (без `+/=`), ≥128 бит
  энтропии, URL-safe. Тест: длина/алфавит/уникальность между вызовами.

### Включение/отзыв ссылки — server actions в `app/app/scenarios/[id]/actions.ts`
- `enableShareLinkAction(scenarioId)`: `auth()` → загрузка сценария с изоляцией
  `WHERE id AND user_id` (нет → ошибка/redirect). Если `share_token` пуст — `generateShareToken()`
  и UPDATE с изоляцией. Прогон `scanScenarioPii(content)` (`lib/pii/scenario-scan.ts`,
  `→ {kinds, count} | null`). Возврат `{ token, piiWarning }`.
- `disableShareLinkAction(scenarioId)`: `auth()` + изоляция → `UPDATE ... SET share_token = NULL`.
- Публичный URL строится на клиенте/в actions как `${baseUrl}/s/${token}` (baseUrl — из
  `lib/auth/base-url.ts` / заголовков запроса, как уже принято в проекте).

### UI в редакторе (`app/app/scenarios/[id]/editor.tsx` + новый компонент)
- Контрол «Поделиться ссылкой»: кнопка-переключатель. Выкл → «Включить ссылку»
  (зовёт `enableShareLinkAction`, показывает URL + кнопку «Скопировать», и `piiWarning`
  баннер если вернулся). Вкл → показывает URL + «Скопировать» + «Отозвать»
  (`disableShareLinkAction`). Начальное состояние (есть ли уже токен) приходит со страницы.
- Страница `app/app/scenarios/[id]/page.tsx` дополнительно отдаёт `initialShareToken` в редактор.

### Публичная страница `app/s/[token]/page.tsx` (БЕЗ авторизации)
- Вне `/app` → `middleware` (matcher `['/app/:path*']`) её НЕ гейтит — публичная по умолчанию.
- Поиск: `SELECT ... FROM scenarios WHERE share_token = token LIMIT 1` (БЕЗ `user_id`).
  Нет строки → `notFound()`.
- Рендер: `buildScenarioDocument(content, meta)` (`lib/export/document-model.ts`) → `DocBlock[]`
  → новый компонент `components/share/ScenarioReadOnly.tsx`, рендерящий блоки
  (`heading`/`paragraph`/`bullets`/`metaTable`) в семантический HTML в фирменном стиле. Контент
  **как есть**, включая ИИ-дисклеймер (он уже в document-model).
- Наружу отдаём ТОЛЬКО `content` + мета (`topic/direction/grade/durationMin/format`) и сам токен.
  НЕ рендерим `inputContext`, `userMaterial`, email, `user_id`.
- Шапка/подвал: логотип + CTA «Создано в Planwise · Создать свой сценарий» → `/register`.
- Кнопки «Скачать PDF/DOCX» → `/api/share/${token}/export?format=pdf|docx`.
- «Скопировать себе»: страница серверная, зовёт `auth()`; если есть сессия — показываем кнопку
  (client-форма → `copyScenarioByTokenAction`).
- `export async function generateMetadata` → `title` = название сценария (лёгкое текстовое
  превью; полноценный og-image — в части (в), вне scope).

### Публичный экспорт `app/api/share/[token]/export/route.ts` (БЕЗ auth)
- Зеркалит `app/api/scenarios/[id]/export/route.ts`, но: ищет по `share_token` (без `user_id`),
  без `auth()`. Rate-limit `checkRateLimit({ key: 'share-export', subject: <token или ip>,
  limit, windowMs })` — защита от абьюза. `isExportFormat` → `renderScenarioExport(format,
  row.content, meta)` → те же заголовки `Content-Disposition` (RFC 5987), что в приватном роуте.
  `logEvent('export', { userId: null, meta: { format, via: 'share' } })`.

### «Скопировать себе» — `copyScenarioByTokenAction(token)` в `actions.ts`
- `auth()` (нет сессии → redirect `/login`). Поиск сценария по `share_token`. Создаёт НОВУЮ
  `scenarios`-строку под текущим `userId` с копией `content`/`inputContext` (+ `title`,
  `direction`, `grade`, `durationMin`, `format`, `topic`). `share_token` копии — `NULL`
  (не наследуется). Пишем начальный `scenario_versions`. Редирект `/app/scenarios/{newId}`.
  Оригинал не трогаем.

## Изоляция и безопасность
- Публичный доступ ТОЛЬКО по `share_token` (≥128 бит, неперебираемо). Отзыв = `NULL` → старая
  ссылка даёт `notFound()`/404.
- Приватные роуты/страница `/app/...` сохраняют изоляцию по `user_id` без изменений.
- Публичная страница и экспорт отдают только контент сценария — никаких полей владельца.
- `copyScenarioByTokenAction` создаёт строго под `auth()`-сессией копирующего.

## Обработка ошибок
- Неверный/отозванный токен → `notFound()` (страница), `404` (экспорт).
- `enable/disable/copy` без владения/сессии → redirect/ошибка, изоляция на load И update.
- Экспорт по токену сверх лимита → `429`.

## Тестирование
- `lib/share/token.ts` — формат, алфавит url-safe, уникальность (юнит, TDD).
- `components/share/ScenarioReadOnly.tsx` — рендерит набор `DocBlock` (heading/paragraph/
  bullets/metaTable) без падений (лёгкий тест).
- Server actions / публичные роуты — интеграционная склейка без юнит-тестов (паттерн проекта),
  проверяются `tsc`/`lint`/`build`. Изоляция/токен-доступ — ручной UAT перед демо.

## Миграции и деплой
- Миграция `0012` (добавление `share_token`) применяется автоматически сервисом `migrate`
  при `docker compose up -d --build`. Без ручных шагов на проде.

## Вне scope (остаётся в #30)
- (б) История версий сценария + откат в UI (`scenario_versions` уже пишутся).
- (в) og-image + полноценный `openGraph` в метаданных.
