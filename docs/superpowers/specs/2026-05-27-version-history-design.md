# Дизайн: UI-история версий сценария (критерий 4)

Дата: 2026-05-27. Закрывает пункт 4 `docs/requirements-compliance.md` (гибкость редактирования). Трекер: backlog.

## Проблема

`scenario_versions` уже копит снапшоты `content` на каждый save/генерацию/копию, но UI просмотра и отката нет. Жюри не видит «истории редактирования».

## Модель данных

Без миграций. Таблица `scenario_versions (id, scenario_id FK→scenarios cascade, content jsonb, created_at)`. Своего `user_id` нет — изоляция через принадлежность `scenario_id` юзеру, проверяется на сервере в каждом действии.

## Server actions (в `app/app/scenarios/[id]/actions.ts`)

- `listVersionsAction(scenarioId)` → `{ ok: true; versions: { id; createdAt }[] } | { ok: false; error }`. Лёгкий список без `content`, `desc` по `created_at`, cap последних 30. Проверка владения сценарием (`loadOwned`).
- `getVersionAction(scenarioId, versionId)` → `{ ok: true; content } | { ok: false; error }`. Для предпросмотра. Двойная изоляция: сценарий принадлежит юзеру И версия принадлежит этому сценарию (`WHERE scenario_versions.id = ? AND scenario_id = ?`).
- `restoreVersionAction(scenarioId, versionId)` → `{ ok: true; content } | { ok: false; error }`. Берёт `content` снапшота; в одной транзакции `UPDATE scenarios SET title/content/updatedAt` + `INSERT scenario_versions` (новый снапшот → откат не теряет текущее состояние, можно отменить откат). `revalidatePath`. Без LLM → без rate-limit.

## UI

- Кнопка «История» в шапке редактора рядом с PDF/DOCX (`editor.tsx`).
- Выезжающая панель-overlay справа (новый клиентский компонент `VersionHistory.tsx`):
  - открытие → `listVersionsAction`, список «Версия N • относительное время», новейшая помечена «текущая»;
  - клик по версии → `getVersionAction` → read-only предпросмотр через переиспользование `buildScenarioDocument(content, meta)` + `<ScenarioReadOnly blocks={...} />`;
  - в предпросмотре кнопка «Восстановить эту версию» с `confirm()` → `restoreVersionAction` → редактор подменяет локальный `content`, dirty=false, панель закрывается.

## Что НЕ делаем (YAGNI)

- Дедупликация/пруннинг снапшотов (копятся на каждый save) — показываем последние 30, пруннинг в backlog.
- Дифф между версиями, именование версий, восстановление в новую копию.

## Тесты

Server-action склейка (как `likeScenarioAction`/`rateGenerationAction`) — без юнит-тестов. Гейты: tsc, biome, build. Изоляция проверяется ревью (двойной `WHERE` на версии). Чистой логики под TDD нет.

## Changelog

Пункт `feature` в текущую `v1.8.0` (по просьбе — без нового минора).
