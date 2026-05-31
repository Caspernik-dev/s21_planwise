# PLAN: feat/rov-tz-compliance — РоВ под ТЗ (2026-05-31)

**Спека:** `docs/superpowers/specs/2026-05-31-rov-tz-compliance-design.md`.
**Ветка:** `feat/rov-tz-compliance` (от master).
**Worktree:** `.claude/worktrees/feat-rov-tz-compliance`.
**Подход:** последовательно, по одному коммиту на задачу. TDD для чистой логики (values-809, rov-date, document-model). UI-задачи — без юнит-тестов, гейты tsc/biome/build.

## Задача 1 — `lib/scenario/values-809.ts` (TDD)
**Файлы:** `lib/scenario/values-809.ts` (новый), `tests/lib/scenario/values-809.test.ts` (новый).

**Содержание:**
- `VALUES_809: readonly string[]` — 17 дословных значений Указа 809.
- `Value809` тип.
- `DIRECTION_TO_LEADING_VALUE: Record<Direction, Value809>` — fallback маппинг (см. спеку).
- `selectValues(skeleton, direction): { leadingValue: Value809; secondaryValues: Value809[]; valueFormulations: {text, basedOn}[] }` — whitelist; если ведущая невалидна → fallback по `direction`; secondaryValues отфильтрованы, дедуплицированы относительно ведущей, ≤3; valueFormulations — `basedOn` строго из 17, ≤8, текст trim+min1.

**Тесты:**
- valid skeleton → возвращает дословно.
- `leadingValue` отсутствует → fallback из direction.
- `leadingValue` невалидный → fallback из direction.
- `secondaryValues` содержит ведущую → удалена.
- `secondaryValues` >3 → обрезано.
- `valueFormulations` с невалидным `basedOn` → отфильтровано.

**Гейт:** `pnpm test -- values-809`, `tsc`, `biome`. Коммит: `feat(rov): каталог ценностей Указа 809 + selectValues whitelist`.

---

## Задача 2 — `lib/scenario/rov-date.ts` (TDD)
**Файлы:** `lib/scenario/rov-date.ts` (новый), `tests/lib/scenario/rov-date.test.ts` (новый).

**Содержание:**
- `isMonday(date: string): boolean` — парсит `YYYY-MM-DD`, проверяет `getDay()===1`.
- `nearestMonday(date: string): string` — ближайший понедельник (для UI-снэпа). Если уже понедельник — тот же день.
- `rovLessonNumber(date: string): number | null` — определяет учебный год, ищет 1-й понедельник сентября этого года, возвращает 1..34 или null.
- `formatLessonDateRu(date: string): string` — «понедельник, 12 сентября 2026» (с использованием `toLocaleDateString('ru-RU', {weekday, day, month, year})`).

**Тесты:**
- понедельник vs четверг.
- `nearestMonday` от воскресенья = следующий день; от пятницы = предыдущий понедельник или следующий (выбрать ближайший).
- `rovLessonNumber('2026-09-07')` = 2 (если 1-й пн сентября 2026 — 7-е? — проверить календарь и зафиксировать ожидаемое значение).
- `rovLessonNumber('2027-05-31')` — последнее занятие цикла или null (зависит от ≤34).
- `rovLessonNumber('2026-08-31')` — null (вне диапазона цикла).

**Гейт:** `pnpm test -- rov-date`, `tsc`, `biome`. Коммит: `feat(rov): хелперы даты — isMonday, rovLessonNumber, formatLessonDateRu`.

---

## Задача 3 — `lib/scenario/schema.ts` + `lib/scenario/options.ts` хелпер группы РоВ
**Файлы:** `lib/scenario/schema.ts`, `lib/scenario/levels.ts` (расширить — у нас уже есть `gradeToRovGroup`), `tests/lib/scenario/schema.test.ts` (если есть — иначе пропустить).

**Содержание:**
- `scenarioContentSchema`: добавить `lessonDate?`, `leadingValue?`, `secondaryValues?`, `valueFormulations?` (все optional). `values: string[].optional()` — оставить.
- `skeletonSchema`: те же optional поля.
- `generationInputSchema`: добавить `lessonDate?: string`. В `superRefine`: если `lessonType==='rov' && lessonDate` → должен быть понедельник (использовать `isMonday`).
- Хелпер `rovGroupLabel(grade): string` — «1–2 классы», «5–7 классы», «СПО» (использовать существующий `gradeToRovGroup` из `levels.ts`).

**Гейт:** `tsc`, `biome`. Коммит: `feat(rov): схема — lessonDate, leadingValue, secondaryValues, valueFormulations`.

---

## Задача 4 — `lib/scenario/prompts/rov.ts` (PROMPT_VERSION v12)
**Файлы:** `lib/scenario/prompts/rov.ts`.

**Содержание:**
- `PROMPT_VERSION = 'v12-rov-tz-2026-05-31'`.
- В `buildRovSkeletonMessages` после `personalResultsBlock` добавить `valuesCatalogBlock`:
  ```
  [VALUES_809_CATALOG] (традиционные ценности Указа Президента РФ № 809):
  1. жизнь
  2. достоинство
  ...
  Выбери одну `leadingValue` (ДОСЛОВНО из списка), 0-3 сопутствующих `secondaryValues` (ДОСЛОВНО, без повторения ведущей).
  Опционально 0-5 «живых» формулировок темы `valueFormulations`, где каждая {text, basedOn} — text это словесная формулировка занятия (например, «дружба»), basedOn ОБЯЗАТЕЛЬНО одна из 17 базовых.
  Не придумывай свои базовые ценности — только из списка.
  ```
- `SKELETON_SCHEMA_HINT`: дописать в JSON-структуру:
  ```
  "leadingValue": string,            // ДОСЛОВНО из [VALUES_809_CATALOG]
  "secondaryValues": string[],       // 0..3 ДОСЛОВНО из того же списка
  "valueFormulations": [             // 0..5 живых формулировок темы
    { "text": string, "basedOn": string }
  ],
  ```

**Гейт:** `tsc`, `biome`, `pnpm build`. Коммит: `feat(rov): промпт каркаса — каталог ценностей 809 (v12)`.

---

## Задача 5 — `lib/scenario/stream.ts` (selectValues + lessonDate)
**Файлы:** `lib/scenario/stream.ts`.

**Содержание:**
- После `parseSkeleton` и `selectPersonalResults` → вызвать `selectValues(skeleton, input.direction)` (только для `lessonType==='rov'`).
- Результат разместить в `skeleton.leadingValue`/`secondaryValues`/`valueFormulations`.
- В `save`-замыкании при сборке `content` — пробросить эти поля + `lessonDate` из `input.lessonDate`.
- `materials` и `values` (legacy) — не трогать.

**Гейт:** `tsc`, `biome`, `pnpm build`, существующие `stream.test.ts` зелёные (моки не должны падать). Коммит: `feat(rov): стрим — whitelist 809 + проброс lessonDate`.

---

## Задача 6 — `app/app/new/page.tsx`
**Файлы:** `app/app/new/page.tsx`.

**Содержание:**
- Для `lessonType==='rov'`: после header-info добавить accent-50 панель про курс РоВ.
- Default `durationMin`: если `lessonType==='rov'` и `30 ∈ allowedDurations` → 30; иначе как было.
- Под `<select id="grade">` для `lessonType==='rov'` — `<p class="text-xs text-neutral-500 italic">УМК группа: {rovGroupLabel(grade)}</p>`.
- Новое поле в основном `<form>` (только для rov): «Дата проведения (понедельник, необязательно)»:
  - `<input type="date" name="lessonDate" value={lessonDate} onChange=...>`;
  - on-change: если `isMonday(value)` — отобразить `formatLessonDateRu(value) + ' (занятие №N)'` (если `rovLessonNumber` есть); если не понедельник — снэп на `nearestMonday` + красный текст «Снэп на ближайший понедельник».
- Передать `lessonDate` в payload `onGenerate`.

**Гейт:** `tsc`, `biome`, `pnpm build`. Коммит: `feat(rov): /app/new — подсказка курса, default 30, hint группы УМК, поле даты`.

---

## Задача 7 — `app/app/scenarios/[id]/editor.tsx`
**Файлы:** `app/app/scenarios/[id]/editor.tsx`.

**Содержание:**
- Card «Цели» → «Цель и задачи»: первый `<Input>` placeholder «Цель занятия (одна ведущая)», последующие — «Задача (опционально)». Кнопка «+ Добавить задачу». Подсказка курсивом «Цель — одна, задачи — опционально».
- **Новая Card** «Формируемые ценности» (рендерится только если `meta.lessonType==='rov'`, для других типов — скрыта):
  - `<select>` ведущей (пустая опция «— не выбрано —» + 17);
  - чипы сопутствующих (мультиселект max 3, исключая выбранную ведущую);
  - список formulations: каждая строка `[Textarea]` + `[<select> basedOn]` + ✕; кнопка «+ Добавить формулировку»;
  - если `content.values` непустой массив И новые поля пустые → серый блок «Унаследованный формат» с list + кнопка «Конвертировать в новый формат» (создаёт `valueFormulations` из строк с `basedOn = DIRECTION_TO_LEADING_VALUE[meta.direction]` или первой из 17; `values` очищается).
- **Новая Card** «Дата проведения» (rov):
  - показ `formatLessonDateRu(lessonDate)` если есть;
  - `<input type=date>` для правки (с снэпом на понедельник как в форме);
  - кнопка «Очистить».
- Прокинуть `meta.lessonType` из page.tsx (если ещё не прокинут).

**Гейт:** `tsc`, `biome`, `pnpm build`. Коммит: `feat(rov): редактор — цель+задачи, ценности 809, дата проведения`.

---

## Задача 8 — `lib/export/document-model.ts` + тесты (TDD)
**Файлы:** `lib/export/document-model.ts`, `tests/lib/export/document-model.test.ts`.

**Содержание:**
- В `buildScenarioDocument` (или где сейчас собирается `metaTable`) — для `lessonType==='rov'` добавить новые строки в шапку (после существующих):
  - если `lessonDate` → «Дата проведения: …»;
  - всегда → «Группа РоВ: …»;
  - если `leadingValue` → «Формируемая ценность (ведущая): …»;
  - если `secondaryValues` → «Сопутствующие ценности: …».
- Под «Цель» — bullets-блок «Задачи» если `goals.length > 1`.
- После целей+задач — блок «Формулировки ценностей на занятии» с буллетами «{text} ({basedOn})», если `valueFormulations` непуст.

**Тесты:**
- rov + lessonDate → строка «Дата проведения» в metaTable.
- rov + leadingValue + secondaryValues → обе строки в metaTable.
- valueFormulations → отдельный блок с правильным форматом.
- goals=['цель','задача1','задача2'] → блок «Задачи» с 2 буллетами.
- non-rov (krujok) → новые строки НЕ появляются.
- старый сценарий с values: string[] без новых полей → не падает.

**Гейт:** `pnpm test -- document-model`, `tsc`, `biome`, `pnpm build`. Коммит: `feat(rov): экспорт — дата, группа, ценности 809, задачи в шапке`.

---

## Задача 9 — Changelog v1.10.0 + финальный прогон гейтов
**Файлы:** `lib/changelog.ts`.

**Содержание:**
- Новый объект v1.10.0 (в начало `CHANGELOG`), kind=feature/improvement:
  - feature: «РоВ: дата проведения (только понедельник) с автоматическим расчётом номера занятия 1–34».
  - feature: «РоВ: ведущая ценность из перечня Указа № 809 + сопутствующие + живые формулировки темы (каждая с привязкой к нормативному перечню)».
  - improvement: «РоВ: автоматический показ группы УМК (1–2 / 3–4 / 5–7 / 8–9 / 10–11 / СПО) по выбранному классу».
  - improvement: «Экспорт PDF/DOCX: цель и задачи разнесены, добавлены строки «Дата проведения», «Группа РоВ», «Формируемая ценность» в шапке».
  - improvement: «Форма создания сценария: дефолт 30 минут для РоВ, подсказка про специфику курса».

**Финальный прогон:** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec biome check`, `pnpm build` — все зелёные. Коммит: `chore: changelog v1.10.0 — РоВ-compliance`.

---

## Гейты после каждой задачи
- `pnpm test` (если задача добавляет тесты — они должны быть зелёные);
- `pnpm exec tsc --noEmit`;
- `pnpm exec biome check <изменённые файлы>` (по необходимости);
- Один атомарный коммит на задачу.

## После мержа в master
- Деплой через `git pull && docker compose up -d --build`. **Без `db:migrate`** (миграций нет).
- Ручной UAT — см. SPEC §«Ручной UAT после деплоя».
