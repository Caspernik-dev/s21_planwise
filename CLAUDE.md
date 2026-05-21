# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## Frontend style reference

`design_example/` — эталон стиля для всего будущего фронта Planwise (Next.js + Tailwind + shadcn/ui).
При создании новых страниц/компонентов сверяться с этой папкой: цветовая палитра (`brand`/`neutral`/`accent`/`warm` в `tailwind.config.ts`), типографика (Inter + Onest), радиусы, тени (`shadow-card`/`hover`/`brand`), паттерны карточек с `ring-1`, sticky navbar с backdrop-blur, бейджи аудитории. Папка — только референс, не для запуска.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Проект «Классный час» — зафиксированные решения

ИИ-генератор сценариев внеурочных занятий (хакатонный кейс 5). Полная спека и планы — см. «Документы проекта» ниже. Здесь — короткая фиксация, что любой Claude-агент должен знать до того, как откроет код.

### Архитектура (не трогать без обсуждения)
- **Монолит Next.js 15 (App Router) + TypeScript.** Без отдельного бэка. Вся серверная логика — Route Handlers и Server Actions.
- **БД: PostgreSQL 16 + pgvector** в Docker (`pgvector/pgvector:pg16`). Внешний порт `5433`, БД/юзер `kc`.
- **ORM: Drizzle** (а не Prisma — экономия RAM).
- **Auth: Auth.js v5 (next-auth beta)**, credentials provider, JWT-сессии, bcrypt cost=10.
- **Стиль фронта строго из `design_example/`** — палитра brand/neutral/accent/warm, Inter+Onest, shadow-card/hover/brand. Папка `design_example/` — референс, не запускается.
- **UI-примитивы:** shadcn-style собственные (Button/Input/Label/Card в `components/ui/`).
- **Менеджер: pnpm 9.** Линтер/форматтер: Biome (не ESLint/Prettier).
- **Деплой:** Docker Compose (Next standalone + Postgres). Целевой прод — VPS 2 vCPU / 4 ГБ RAM.

### Жёсткие ограничения
- **Локальные LLM запрещены.** Всё связанное с LLM — внешний API: GigaChat для chat + embeddings. Ключи в `.env.local` через `GIGACHAT_AUTH_KEY`/`GIGACHAT_SCOPE`. Не предлагать sentence-transformers, spaCy-модели, ollama и т.п. **Размерность эмбеддингов на проде — 2560** (миграция `0010` подняла все `embedding`-колонки `1024→2560`; старые заметки про «1024 dims» в Plan 3/7 устарели).
- **RAM-бюджет 4 ГБ** на проде. Никаких Puppeteer/headless Chrome (для PDF используем `@react-pdf/renderer`), Prisma engine, локальных ML-моделей, jvm/python-воркеров.
- **UI только на русском.** Без многоязычности.
- **Auth — email/пароль.** Без OAuth/magic-link/2FA (это явно out-of-scope MVP).

### Пайплайн генерации (вариант B — двухэтапный с пред-рекомендацией)
Зафиксирован в спеке. Любая альтернатива требует обсуждения.
1. Форма → 2. PII-анонимизация → 3. Pre-match: поиск похожих готовых в `shared_scenarios` (порог `SIMILARITY_THRESHOLD` env, дефолт 0.78, **обязательно калибровать** до демо) → 4. RAG retrieval (3 методички + 2 shared + опц. 1 из плана) → 5. Stream skeleton (GigaChat call 1) → 6. Stream details (GigaChat call 2) → 7. Validate (zod) + автонормализация хронометража + save → 8. Edit (TipTap-блоки + ↑/↓, **не drag-handle**) → 9. Like + opt-in shared → 10. Export PDF/DOCX.

### Политики приватности (критичные)
- **PII-детект:** локально, regex + словари RU-имён + правила. **Без проверок контрольной суммы СНИЛС/ИНН** (в плане воспитательной работы их не бывает).
- **Авто-анонимизация по умолчанию.** Отмена замены пользователем требует подтверждения с явным текстом «эти данные будут отправлены во внешний сервис GigaChat. Продолжить?» + чекбокс «понимаю», решение логируется.
- **Шаринг лайков — opt-in** (галка при лайке). Перед записью в `shared_scenarios` — повторный PII-чек уже на content сценария; если что-то найдено — не пускаем.
- **«Использовать как есть» из библиотеки сообщества создаёт КОПИЮ** (новая запись `scenarios` с `source_shared_id`), не ссылку. Редактирование не затрагивает оригинал.

### Технические нюансы (от которых легко наступить на грабли)
- **`partial-json` для стрима** с fallback на skeleton-loader, если падает.
- **Гибридный поиск:** `0.7 * cosine + 0.3 * BM25` (PG `to_tsvector`). Словарь `russian` может быть недоступен — fallback `simple` через env `PG_TSV_LANG`.
- **Rate-limit:** lazy cleanup при каждом INSERT в `rate_buckets` (без cron). `MAX_GENERATIONS_PER_DAY=10` per user + whitelist `DEMO_USER_EMAILS` (без лимита) — для демо жюри.
- **Календарь поводов** — статический массив `lib/calendar-events.ts`, не LLM-вызов.
- **`scripts/ingest-razgovor.ts`** — критический путь до демо, не опциональный.
- **Playwright E2E — НЕ в CI**, только manual перед демо. CI = `vitest run` (unit + integration).
- **Никаких raw SQL без `WHERE user_id = ?`** для пользовательских таблиц. Изоляция данных — критерий жюри.

### Документы проекта
- **Brief кейса:** `klassniy-chas-brief.md`
- **Spec (утверждён 2026-05-20):** `docs/superpowers/specs/2026-05-20-klassniy-chas-design.md` — единственный источник истины по продукту.
- **Планы:** `docs/superpowers/plans/2026-05-20-plan-N-*.md` — 9 последовательных фаз (1 Foundation … 9 Demo-readiness). Все ГОТОВЫ.
- **Стиль-референс:** `design_example/` (Next+Tailwind+shadcn, токены в `design_example/tailwind.config.ts`).
- **Backlog доработок:** `docs/backlog.md` — живой трекер оставшихся задач (что сделано / критично / фичи / прод / артефакты кейса). Обновлять при закрытии пунктов.

### Статус реализации (обновлять при завершении фазы)
- **Plan 1 «Foundation» — ГОТОВ.** Ветка `feat/foundation`, тег `foundation-done` (19 коммитов). Реализовано через subagent-driven (имплементер + spec-review + code-review на каждую из 14 задач + финальный холистический ревью).
  - Что работает: Next.js 15 монолит, дизайн-токены из design_example, shadcn-примитивы (Button/Input/Label/Card), Postgres+pgvector в Docker (pgvector ставится миграцией `0001`), Drizzle + 4 auth-таблицы, bcryptjs (TDD), Auth.js v5 credentials+JWT, middleware-гейт `/app/*`, страницы `/login` `/register` (server actions с обработкой NEXT_REDIRECT + AuthError + защита от open-redirect), защищённый `/app` shell с Navbar+logout, Biome, Vitest (6/6).
  - Гейты зелёные: `pnpm test` (6/6), `pnpm lint`, `pnpm build`, fresh `db:up && db:migrate`.
  - **Технический долг → Plan 8:** CSRF на `/app/logout`; rate-limit на login/register; `AUTH_URL` derive из request; auth integration-тесты; таблицы `sessions`/`verificationTokens` пока пустые (оставлены под будущий OAuth). Edge-bundle тянет `postgres` через adapter — работает (JWT-стратегия), но при переходе на `strategy:'database'` сломается.
  - **GigaChat-ключи** уже в `.env.local` (`GIGACHAT_AUTH_KEY` = base64 client_id:client_secret, отдельный client_id не нужен; `GIGACHAT_SCOPE=GIGACHAT_API_PERS`).
- **Plan 2 «Generation v0 single-shot» — ГОТОВ.** Ветка `feat/generation` (от `foundation-done`), тег `generation-v0-done`. Реализовано через subagent-driven (имплементер + spec/quality-ревью).
  - Что работает: схема БД `scenarios`/`scenario_versions`/`generations` (миграция `0002`); zod `ScenarioContent` + `generationInputSchema` (`lib/scenario/schema.ts`); справочники `lib/scenario/options.ts`; нормализация хронометража `lib/scenario/normalize.ts` (TDD); промпт-builder `lib/scenario/prompt.ts`; GigaChat-клиент `lib/gigachat/*` (OAuth `ngw.devices.sberbank.ru:9443/api/v2/oauth` → access_token с in-memory кэшем, refresh за 60с; chat `/api/v1/chat/completions`, без стрима); оркестрация `lib/scenario/generate.ts` (parse+strip-fences → zod → 1 repair-pass → normalize); server action `app/app/new/actions.ts`; форма `/app/new`; read-only `/app/scenarios/[id]` с изоляцией по `user_id`; дашборд `/app` со списком и кнопкой «Создать».
  - Гейты зелёные: `pnpm test` (35/35, 8 файлов), `pnpm lint`, `pnpm build`. **Реальная генерация подтверждена** через прод-код (`generateScenario`) против живого GigaChat: валидный сценарий, хронометраж=30, repair-pass реально срабатывает.
  - **TLS-нюанс (важно):** GigaChat использует сертификаты «Минцифры РФ». TLS-обход реализован через `NODE_TLS_REJECT_UNAUTHORIZED=0` на уровне процесса (env `GIGACHAT_INSECURE_TLS=true`, dev-only) в `lib/gigachat/tls.ts` — НЕ через undici `dispatcher` (userland-undici Agent несовместим со встроенным fetch Node 24 → `UND_ERR_INVALID_ARG`). **Прод:** ставить корневой сертификат через `NODE_EXTRA_CA_CERTS` и держать флаг `false`.
  - **Технический долг → Plan 8:** rate-limit/whitelist на генерацию (`MAX_GENERATIONS_PER_DAY`); PII пока не подключён (Plan 5); `generation_meta`/`scenario_versions` пишутся, но не используются UI (версии — под будущий редактор Plan 4); embedding-колонка в `scenarios` НЕ добавлена (под RAG Plan 3); GigaChat нередко требует repair-pass — качество промпта калибровать позже.
  - **GigaChat-ключи** в `.env.local` (`GIGACHAT_AUTH_KEY` = base64 client_id:client_secret; `GIGACHAT_SCOPE=GIGACHAT_API_PERS`; + `GIGACHAT_OAUTH_URL`/`API_BASE`/`MODEL`/`INSECURE_TLS`). В worktree `.env.local` создаётся не из git — реальный ключ копировать из основного чекаута.
- **Plan 3 «RAG» — ГОТОВ.** Ветка `feat/rag` (от `generation-v0-done`). План: `docs/superpowers/plans/2026-05-20-plan-3-rag.md`. Реализовано через subagent-driven (имплементер + spec-review + code-review на каждую из 12 задач).
  - Что работает: GigaChat embeddings-клиент `lib/gigachat/embeddings.ts` (`EmbeddingsGigaR` 1024d, батчинг по `RAG_EMBED_BATCH`, mock-тесты); Drizzle `customType` vector/tsvector (`db/types.ts`); таблицы `rag_documents`/`rag_chunks` + `scenarios.embedding` (миграция `0003`) + HNSW/GIN/grade-индексы (кастомная миграция `0004_rag_indexes`); `lib/rag/hash.ts` (sha256-идемпотентность), `lib/rag/chunk.ts` (структурный чанкинг 300–800 ток., `section_kind`/`stage_idx`, TDD), `lib/rag/score.ts` (гибрид `0.7·cosine+0.3·BM25` + диверсификация ≤2/doc, TDD), `lib/rag/ingest.ts` (идемпотентное ядро, инъекция deps) + `lib/rag/ingest-db.ts` (Drizzle-адаптер, tsv через `to_tsvector(lang::regconfig)`), `lib/rag/retrieve.ts` (гибридный SQL `<=>`+`ts_rank`, фильтр grade/direction, fallback без направления при <topK, TDD); сериализатор `lib/scenario/to-markdown.ts` (TDD, frontmatter quoted — colon-safe round-trip); RAG в промпте `lib/scenario/prompt.ts` (`[RELEVANT_METHODOLOGY]`, `PROMPT_VERSION=v1-rag-2026-05-20`) + `generate.ts` (retrieval инъектируется, **сбой retrieval НЕ валит генерацию**, `usedChunkIds` в meta) + `actions.ts` (best-effort populate `scenarios.embedding`).
  - Скрипты: `scripts/gen-seed.ts` (12 эталонов через `generateScenario` с отключённым retrieval → markdown), `scripts/ingest-seed.ts`, `scripts/ingest-razgovor.ts` (по sitemap, только `1s`+`2m`, grade из URL, rate-limit, идемпотентно). Источник РоВ: см. memory `razgovory-source-structure`.
  - Гейты зелёные: `pnpm test` (69/72, 3 skip — guarded live smoke), `pnpm lint`, `pnpm build`, `tsc --noEmit`. Миграции применяются идемпотентно (схема-смоук зелёный).
  - **Решение пользователя:** seed-контент генерируется через GigaChat, не вручную; живые сетевые шаги (gen-seed, ingest-seed, ingest-razgovor) — **manual/opt-in вне CI** (флаг `RAG_LIVE=1` для guarded-смоук).
  - **Статус ingest на проде (проверено 2026-05-21):** ingest РоВ **ВЫПОЛНЕН** — корпус наполнен: `rag_documents=88` (77 `razgovor` + 11 `seed`), `rag_chunks=529` (510 razgovor), все диапазоны классов (1-2…10-11 + СПО), 0 чанков без `embedding`/`tsv`, оператор `<=>` живой (self-NN=0). «Опора на методички» реально работает. **Калибровка `SIMILARITY_THRESHOLD` ВЫПОЛНЕНА** — порог `0.78 → 0.72` (см. пост-milestone блок «Контекст генерации + библиотека»). Эмбеддинги — 2560-dim (миграция `0010`).
  - **Технический долг:** у чанков «Разговоров о важном» `direction=null` (в URL направление не размечено) → фильтр по направлению для РоВ-чанков не работает, опора на cosine + fallback; `scenarios.embedding` без HNSW-индекса (под будущий pre-match); pre-match по `shared_scenarios` и калибровка `SIMILARITY_THRESHOLD` — вне scope (план Likes/Shared); токены оцениваются эвристикой `chars/3` (локальный токенайзер запрещён).
- **Plan 4 «Редактор сценария» — ГОТОВ.** Ветка `feat/editor` (от `rag-done`), тег `editor-done`. План: `docs/superpowers/plans/2026-05-20-plan-4-editor.md`. Реализовано через subagent-driven (имплементер + spec-review + code-review на каждую из 6 задач + финальный холистический ревью). Согласованный scope: структурный блочный редактор (НЕ TipTap/rich-text — контент остаётся строго `ScenarioContent`, нет HTML/XSS), explicit save (НЕ авто-сейв), минимальная точечная регенерация активности.
  - Что работает: `lib/scenario/edit-ops.ts` (чистые иммутабельные `moveStage`/`moveActivity`, TDD); `lib/scenario/regenerate.ts` (регенерация ОДНОЙ активности через GigaChat + RAG-чанки, repair-pass, валидация `activitySchema`, DI `chat`, зеркалит `generate.ts`, TDD); примитив `components/ui/textarea.tsx`; server actions `app/app/scenarios/[id]/actions.ts` — `saveScenarioAction` (zod-валидация content, изоляция `user_id` на load И update, UPDATE+снапшот `scenario_versions` в одной транзакции, `revalidatePath`) и `regenerateActivityAction` (изоляция, RAG retrieve best-effort, лог в `generations`); клиентский редактор `editor.tsx` (правка title/goals/materials/stage.title/duration_min/activity.text/questions, ↑/↓ reorder этапов и активностей с disable на границах, 🎲 точечная регенерация, dirty-индикатор, explicit Save); страница `[id]/page.tsx` рендерит редактор вместо read-only.
  - Гейты зелёные: `pnpm test` (83 passed, 3 skip — guarded live), `pnpm lint`, `tsc --noEmit`, `pnpm build`.
  - **НЕ выполнено (ручной шаг перед демо):** живой браузерный UAT golden-path (правка → save → reload → reorder → 🎲 с живым GigaChat → проверка 404 на чужой сценарий). Проверено только статикой (тесты/типы/сборка). 🎲 требует живого ключа GigaChat.
  - **Технический долг → Plan 8:** rate-limit на `regenerateActivityAction` (LLM-вызов без лимита); `scenario_versions` пишутся без retention/pruning и без UI-истории версий; добавление/удаление этапов и активностей в редакторе НЕ реализовано (вне scope Plan 4); `latencyMs` для regen не замеряется (пишется `null`).
- **Plan 5 «Экспорт PDF/DOCX» — ГОТОВ.** Ветка `feat/export` (от `editor-done`), тег `export-done`. План: `docs/superpowers/plans/2026-05-20-plan-5-export.md`. Реализовано через subagent-driven (имплементер + spec-review + code-review на каждую задачу + финальный холистический ревью на Opus). Согласованный scope: server-side рендер в одном GET route, общая нейтральная модель блоков под оба формата, полный методический бланк, PT Sans вшит в PDF, изоляция по `user_id`.
  - Что работает: `lib/export/document-model.ts` (чистый маппер `ScenarioContent`+`ExportMeta` → `DocBlock[]`: heading/paragraph/bullets/metaTable; нумерация только нерефлексивных этапов; метки типов активностей; TDD 7 тестов); `lib/export/to-docx.ts` (билдер `docx` v9, шрифт Times New Roman, без embed); `lib/export/to-pdf.tsx` (`@react-pdf/renderer` v4, регистрация PT Sans regular+bold через `process.cwd()/assets/fonts`, `renderToBuffer`); `lib/export/index.ts` (диспетчер `isExportFormat` + `renderScenarioExport` → `{body,contentType,ext}`); route `app/api/scenarios/[id]/export/route.ts` (runtime `nodejs`, auth→401, валидация формата→400, изоляция `WHERE id AND userId`→404, Content-Disposition с RFC 5987 `filename*` UTF-8 + экранирование `'`/`*`); кнопки PDF/DOCX (plain `<a href>` download) + dirty-подсказка в тулбаре `editor.tsx`. Шрифты вшиты в репо `assets/fonts/` (OFL), попадают в standalone через `outputFileTracingIncludes`.
  - Гейты зелёные: `pnpm test` (95 passed, 3 skip — guarded live), `pnpm lint`, `tsc --noEmit`, `pnpm build` (route в выводе, без утечки тяжёлых либ в клиентский бандл; шрифты подтверждены в `.next/standalone/assets/fonts`).
  - **НЕ выполнено (ручной шаг перед демо):** живой браузерный UAT — скачать PDF и DOCX из редактора, визуально проверить кириллицу в PDF (PT Sans) и в DOCX (системный Times New Roman), проверить 404 на чужой сценарий. Проверено только статикой + smoke-тестами сигнатур (`%PDF`/`PK`).
  - **Технический долг → Plan 8:** rate-limit экспорта 100/день/user (§9) НЕ реализован (отложен вместе с остальной rate-limit инфраструктурой); экспорт берёт последнюю сохранённую версию из БД (несохранённые правки не попадают — отсюда dirty-подсказка); DOCX без полей/стилей страницы (дефолтные margins); экспортные либы пока не помечены `import 'server-only'` (защищены тем, что импортируются только из route/lib).
- **Plan 6 «PII-подсистема + загрузка плана» — ГОТОВ.** Ветка `feat/pii-plan-upload` (от `export-done`), тег `pii-plan-done`. План: `docs/superpowers/plans/2026-05-20-plan-6-pii-plan-upload.md`. Реализовано через subagent-driven (имплементер + spec/quality-ревью на каждую из 14 задач + финальный холистический ревью). Согласованный scope: полный вертикальный срез — ядро `lib/pii` (TDD) + загрузка плана с diff-анонимизацией + парсинг в темы с прогрессом.
  - Что работает: **`lib/pii`** (полностью локально, без сети): `patterns.ts` regex для телефон/email/СНИЛС/паспорт/ИНН/ДР/адрес (**без контрольных сумм**; паспорт/ИНН/ДР — только в контексте ключевого слова), `names.ts` детект ФИО (словарь `names.json` ~80 имён + патроним/фамилия-суффиксы; **`\b` не работает на кириллице → Unicode-lookaround `(?<![А-ЯЁа-яё])`**), `detect.ts` объединение + жадное снятие пересечений, `anonymize.ts` детерминированные плейсхолдеры `[Тип_N]` (одно значение → один плейсхолдер), `index.ts` барель `detectAndAnonymize`. **`lib/parse/index.ts`** — pdf-parse/mammoth/TextDecoder в памяти (без /tmp), guard'ы 5 МБ + magic-bytes (`%PDF-`/`PK`). **`lib/plan/parse-topics.ts`** — эвристический разбор (маркер ИЛИ дата; дата извлекается ДО маркера). Таблицы `work_plans`/`plan_topics` (миграция `0005`, обе с `user_id`). Server actions `app/app/plans/actions.ts`: `analyzePlanAction` (parse+PII-diff, без сохранения) + `savePlanAction` (**анонимизация пересчитывается на сервере — клиентским полям не доверяем**; consent-гейт на сохранение необезличенного с серверной проверкой `consent==='on'`). UI: `upload-form.tsx` (зона загрузки, diff original→placeholder, чекбокс согласия с точным текстом «…отправлены во внешний сервис GigaChat»), `/app/plans` (список + прогресс «закрыто N/M», бейдж обезличен/без), `/app/plans/[id]` (темы, ✓готов / «Сгенерировать» → `/app/new?topic=&planTopicId=`). Интеграция: `/app/new` префил из query (через `Suspense`+`useSearchParams`) + `generateScenarioAction` проставляет `source_plan_topic_id` (с проверкой владения темой). Навбар: ссылка «Планы»; дашборд: карточки прогресса по планам.
  - Гейты зелёные: `pnpm test` (130 passed / 3 skip — guarded live), `pnpm lint`, `tsc --noEmit`, `pnpm build` (все роуты в выводе). Изоляция по `user_id` подтверждена холистическим ревью на ВСЕХ запросах к `work_plans`/`plan_topics`/`scenarios`; `lib/pii` без сетевых импортов.
  - **НЕ выполнено (ручной шаг перед демо):** живой браузерный UAT — загрузить реальный PDF/DOCX плана с ПДн, проверить diff-модалку, путь согласия, разбор на темы и счётчик прогресса. Проверено только статикой/юнит-тестами (PII/parse/topics плотно покрыты TDD; server actions — интеграционная склейка без юнит-тестов по плану). Миграция `0005` применена к общей dev-БД (docker-сокет закрыт в sandbox, but Postgres уже поднят).
  - **Технический долг → Plan 8 / след. фазы:** мягкий PII-warning при сохранении сценария (§6 точка 2) НЕ реализован; повторный строгий PII-чек при opt-in shared — следующая фаза (Likes/Shared); pre-match по `shared_scenarios` — там же; календарь и лендинг — отдельные фазы; rate-limit загрузок 20/день (§9) НЕ реализован; `lib/parse` `ParseInput.mimeType` не используется (kind по расширению); словарь имён маленький (~80) — расширяемый.
- **Plan 7 «Community-loop» — ГОТОВ.** Ветка `feat/community-loop` (от `pii-plan-done`), тег `community-loop-done` (13 коммитов). План: `docs/superpowers/plans/2026-05-20-plan-7-community-loop.md`. Реализовано через subagent-driven (имплементер + spec/quality-ревью на каждую из 12 задач + финальное холистическое ревью, вердикт **Ship**). Согласованный scope: полный Community-loop + страница `/app/library` с семантическим поиском + подмешивание shared как `GOOD_EXAMPLES` в RAG-промпт генерации.
  - Что работает: таблицы `likes` (unique `(user_id, scenario_id)` → лайк не задваивается) + `shared_scenarios` (`anonymized_content` jsonb, `embedding` vector(1024), `like_count`, unique `source_scenario_id`, индекс по direction; миграция `0006`). **`lib/community`** (TDD): `serialize.ts` (обход всех строковых полей `ScenarioContent`), `pii-gate.ts` (**строгий повторный PII-чек**: анонимизация content → ре-детекция; если что-то осталось — `{clean:false}`, шаринг блокируется), `prematch.ts` (`embed(direction+grade+topic+format)` → поиск в shared с фильтрами `direction/grade±2/format` + порог `SIMILARITY_THRESHOLD` env деф. 0.78, deps-injection как `retrieve.ts`), `share-target.ts` (create/increment/noop для `like_count`), `copy.ts` (маппер shared→новый `scenarios` с `source_shared_id`). Server actions в `app/app/scenarios/[id]/actions.ts`: `likeScenarioAction` (upsert лайка; **PII-gate ДО любой записи в shared**; на остаточный PII → `{piiBlocked:true}` с перечислением типов; create вставляет shared с эмбеддингом, increment бампит `like_count` исходной записи для копий) + `useSharedAsIsAction` (**«использовать как есть» = КОПИЯ** под текущим `userId`, оригинал не трогается). UI: `LikeShareControls` в редакторе (чекбокс «Поделиться с сообществом» + лайк, surface ошибки PII), `SharedCard` (карточка с ❤ like_count + «Использовать как есть»), двухшаговый flow в `/app/new` (Подобрать похожие → карточки pre-match / «Сгенерировать новый», при отсутствии совпадений — сразу генерация), страница `/app/library` (семантический поиск по shared, `LIBRARY_SIMILARITY_THRESHOLD` деф. 0.5 мягче pre-match; пустой запрос → топ по `like_count`), ссылка «Библиотека» в навбаре, карточка «Библиотека сообщества: N» на дашборде. RAG-промпт: `prompt.ts` секция `[GOOD_EXAMPLES]` (только title + список названий этапов — экономия токенов), `generate.ts` подтягивает top-2 shared (best-effort, **prematch инъектируется через `GenerateDeps.prematch`** → юнит-тесты не ходят в сеть).
  - Гейты зелёные: `pnpm test` (146 passed / 3 skip — guarded live), `pnpm lint`, `tsc --noEmit`, `pnpm build` (все роуты, включая `/app/library`). Холистическое ревью: PII-инвариант (нет пути необезличенного content в `shared_scenarios`) и изоляция по `user_id` (единственная публичная таблица — `shared_scenarios`, у неё нет `user_id` намеренно; копии/лайки строго под сессией) подтверждены; SQL параметризован, vector-литералы только из числового вывода `embed()`.
  - **НЕ выполнено (ручные шаги перед демо):** живая калибровка `SIMILARITY_THRESHOLD` на ≥20 реальных запросах (`scripts/calibrate-threshold.ts` — НЕ написан, отдельный ручной артефакт); браузерный UAT (лайк → opt-in шаринг с реальными ПДн в content → проверка блокировки; pre-match карточки; «использовать как есть»; поиск в `/app/library`); реальный ingest корпуса для наполнения shared. Проверено только статикой/юнит-тестами (чистая логика — TDD; server actions/UI — без юнит-тестов, проверены tsc/lint/build + холистическое ревью). БД с реальным Postgres не прогонялась (нет в sandbox).
  - **Технический долг → Plan 8:** `useSharedAsIsAction` без транзакции (scenario + начальный version-row двумя стейтментами) и без rate-limit (спам копий, но без LLM-токенов); rate-limit на поиск `/api/search` 60 RPM (§9) НЕ реализован; `like_count` модель агрегации простая (инкремент только при первом opt-in лайке копии — лайки оригинала не суммируются между авторами); `anonymized_content` приводится `as`-кастом без рантайм-валидации формы (защищено try/catch в местах чтения).
- **Plan 8 «Streaming генерации (SSE) + Rate-limit» — ГОТОВ.** Ветка `feat/streaming-ratelimit` (от `community-loop-done`), тег `streaming-ratelimit-done`. План: `docs/superpowers/plans/2026-05-20-plan-8-streaming-ratelimit.md`. Реализовано через subagent-driven (имплементер + spec-review на ключевых + финальное холистическое ревью). Согласованный scope (бандл): двухэтапный SSE-стрим генерации + полная rate-limit инфраструктура. ВНЕ scope: календарь, лендинг, CSRF logout, AUTH_URL derive, мягкий PII-warning при сохранении, калибровка порога.
  - **Стриминг:** `lib/gigachat/sse.ts` (`parseSSEBuffer` — чистый парсер SSE-буфера, TDD); `lib/gigachat/client.ts` + `chatCompletionStream` (async-генератор, `stream:true`, reader+TextDecoder, существующий `chatCompletion` цел, TDD с ReadableStream-стабом); `lib/scenario/partial.ts` (`parsePartialJson` — дополнение оборванного JSON без внешней зависимости, TDD 8 кейсов); `lib/scenario/schema.ts` `skeletonSchema`/`ScenarioSkeleton` + `lib/scenario/prompt.ts` `buildSkeletonMessages`/`buildDetailsMessages` (`PROMPT_VERSION=v2-stream-2026-05-20`, TDD); `lib/scenario/stream.ts` `streamScenario(input, deps)` (async-генератор `StreamEvent`: phase/skeleton/stage/done/error; RAG+prematch best-effort как в `generate.ts`; skeleton-stream→валидация+repair→details-stream→валидация+repair→нормализация→`save`; **все deps инъектируются — юнит-тесты без сети/БД**, spec-review ✅); route `app/api/generate/stream/route.ts` (POST SSE, auth→401, zod→400, **rate-limit→429 ДО открытия стрима**, `save`-замыкание = insert scenarios+versions+generations+embedding с изоляцией `user_id`, `sourcePlanTopicId` резолвится фильтром по userId); клиент `components/generation/GenerationStream.tsx` (fetch reader + `parseSSEBuffer`, прогресс-бар фаз, пульсация каркаса, `done`→push на сценарий, 429/error→сообщение+retry); `/app/new` переключён на стрим (`generateScenarioAction` УДАЛЁН как осиротевший, prematch-флоу сохранён).
  - **Rate-limit:** таблица `rate_buckets` (generic `subject` text = userId ИЛИ ip — осознанное отклонение от `user_id fk` ради login-лимита по IP; PK `(key,subject,window_start)`; миграция `0007`); `lib/ratelimit/window.ts` (`windowStartFor`+`isWhitelisted`, TDD); `lib/ratelimit/index.ts` `checkRateLimit(check, deps)` (чистая логика над инъектируемым `RateStore`, whitelist-байпас по `DEMO_USER_EMAILS`, **lazy cleanup** DELETE>24ч на каждый вызов — без cron, TDD с in-memory store) + `lib/ratelimit/store.ts` `dbStore` (drizzle, `onConflictDoUpdate` инкремент; динамический import → юнит-тесты не тянут БД). Подключено на 5 точек §9: генерация `MAX_GENERATIONS_PER_DAY` (деф.10)/день + whitelist, login 5/15мин/IP, upload 20/день, export 100/день, search 60/мин.
  - Гейты зелёные на каждом коммите: `pnpm test` (173 passed / 3 skip — +27 новых), `pnpm lint`, `tsc --noEmit`, `pnpm build` (роут `/api/generate/stream` в выводе). Миграция `0007` применена к dev-БД.
  - **НЕ выполнено (ручной шаг перед демо):** живой браузерный UAT стрима против реального GigaChat (skeleton→details, прогресс-бар, fallback при обрыве) — проверено только статикой/юнит-тестами; стрим эмитит `skeleton` единым событием после сбора каркаса (не реалтайм по дельтам — упрощение по плану), `stage`-события синхронны после валидации деталей; usage-токены в стрим-режиме не парсятся (`meta.usage=null`).
  - **Технический долг → след. фазы:** реалтайм-прогресс по этапам внутри details-стрима; rate-limit на `regenerateActivityAction`/`useSharedAsIsAction`/prematch (LLM/спам — пока без лимита); login keyed по `x-forwarded-for` (за прокси корректно, при прямом подключении — `unknown`); остаток DoD §12 — календарь, лендинг, CSRF logout, AUTH_URL derive, мягкий PII-warning, калибровка `SIMILARITY_THRESHOLD`, проверка `russian` tsv в Docker.
- **Plan 9 «Demo-readiness» — ГОТОВ (финальная фаза).** Ветка `feat/demo-readiness` (от `streaming-ratelimit-done`), тег `demo-readiness-done` (15 коммитов). План: `docs/superpowers/plans/2026-05-20-plan-9-demo-readiness.md`. Worktree `.claude/worktrees/feat-demo-readiness`. Реализовано через subagent-driven (имплементер + spec-review на ключевых задачах: PII-save, изоляция календаря; + финальное холистическое ревью **READY TO MERGE** + `security-review` **SAFE TO DEMO**). Согласованный scope (полный demo-bundle): security/PII-polish + календарь поводов + лендинг + демо-prep.
  - **Security/PII-polish:** `lib/auth/origin.ts` (`isSameOrigin`/`assertSameOrigin`, TDD) — same-origin CSRF-guard на `/app/logout` (fail-closed, 403 при чужом/отсутствующем Origin); `lib/auth/base-url.ts` (`baseUrlFrom`/`baseUrlFromRequest`, TDD) — redirect-base из заголовков запроса (путь фиксированный `/` → не open-redirect); rate-limit на `regenerateActivityAction` (`MAX_REGEN_PER_DAY` деф.40), `useSharedAsIsAction` (`MAX_COPY_PER_DAY` деф.50), `prematchAction` (`MAX_PREMATCH_PER_DAY` деф.60) — subject=userId, whitelist через `DEMO_USER_EMAILS`; **мягкий PII-warning при сохранении** (§6 п.2) `lib/pii/scenario-scan.ts` (TDD) → `saveScenarioAction` возвращает `piiWarning` НО `ok:true` (неблокирующий), баннер в редакторе; строгий opt-in-share gate НЕ тронут.
  - **Календарь поводов:** статический `lib/calendar-events.ts` (25 дат, БЕЗ LLM, TDD-инварианты); таблица `calendar_events` (миграция `0008`, FK cascade users+scenarios, индекс `(user_id, event_date)`); `lib/calendar/events.ts` (`bindScenarioToDate`/`listUserEvents`/`unbindEvent`, **изоляция по `user_id` во всех read/delete**, DI-стаб в тестах без БД, TDD); `app/app/calendar/actions.ts` (bind проверяет владение сценарием ДО записи + берёт title из owned-строки, unbind scoped по userId); страница `/app/calendar` + `components/calendar/CalendarGrid.tsx` (месячная сетка в порядке учебного года Сен→Авг, секция «Ваши занятия на датах»); кнопка «На дату» в редакторе (`meta.id`, onClick+useTransition); 3-й источник темы «Календарь поводов» в `/app/new` (управляемый topic, переход с `?topic=&calendarDate=` префилит и выбирает вкладку); ссылка «Календарь» в навбаре.
  - **Лендинг:** `app/page.tsx` перезаписан + `components/landing/*` (LandingNavbar/Hero/Features/HowItWorks/Audience/Cta/Footer) — адаптация из `design_example/` на существующие токены (brand/neutral/accent/warm, Inter+Onest, shadow-card/hover/brand, lucide-иконки), весь текст русский, CTA → `/register`/`/login`. **НЕ импортирует `design_example` и не коммитит его** (untracked).
  - **Демо-prep:** `scripts/calibrate-threshold.ts` (24 запроса → распределение top-sim для `SIMILARITY_THRESHOLD`, ручной прогон); `scripts/seed-demo.ts` (идемпотентный демо-аккаунт, guard от прогона в prod через `ALLOW_PROD_SEED`); `docs/qa.md` (UAT чек-лист + ручные шаги).
  - Гейты зелёные: `pnpm test` (192 passed / 3 skip — +19 новых), `pnpm lint` (exit 0), `tsc --noEmit`, `pnpm build`. Миграция `0008` применена к dev-БД (smoke зелёный).
  - **Решение по scope:** отдельная вкладка «Из плана» в `/app/new` НЕ добавлена — поток покрыт переходом со страницы планов через `?planTopicId=` (зафиксировано как backlog в `docs/qa.md`).
  - **НЕ выполнено (ручные шаги перед демо, требуют живого окружения):** браузерный визуальный QA лендинга и календаря; живая калибровка `SIMILARITY_THRESHOLD` (`pnpm calibrate`, нужна наполненная `shared_scenarios`); проверка словаря `russian` в `to_tsvector` на Docker-Postgres (fallback `PG_TSV_LANG=simple`); E2E golden-path; `pnpm seed:demo` + добавление email в `DEMO_USER_EMAILS`. Чек-лист — `docs/qa.md`.
  - **Вне scope кода (демо-артефакты):** скринкаст 5–7 мин, презентация 8 блоков.
- **Plan 10 «Admin-панель статистики» — ГОТОВ.** Ветка `feat/admin-stats` (от `master`, т.е. после мержа demo-readiness), тег `admin-stats-done` (13 коммитов). Спека: `docs/superpowers/specs/2026-05-20-admin-stats-design.md`, план: `docs/superpowers/plans/2026-05-20-plan-10-admin-stats.md`. Worktree `.claude/worktrees/feat-admin-stats`. Реализовано через subagent-driven (имплементер + spec-review на ключевых: events-emit, admin-гейт; + холистическое ревью **READY TO MERGE**). Подход: read-only дашборд поверх существующих таблиц (история уже копится через `created_at`) + events-лог для эфемерных метрик.
  - **Роли:** `users.role text NOT NULL DEFAULT 'user'` (миграция `0009`), прокинут через `authorize`→JWT→session (`auth.ts`, тип `Session.user.role`); `lib/admin/guard.ts` `isAdmin(session)` (TDD); страница `/app/admin` редиректит не-админов на `/app` ДО любых запросов; ссылка «Админ» в навбаре только для admin; скрипт `pnpm set:admin <email>` (`scripts/set-admin.ts`).
  - **Статистика:** `lib/admin/stats.ts` — агрегаты по ВСЕМ юзерам (намеренно непроскоуплено, единственная точка чтения чужих данных, гейтится только страницей-админкой): `generationStats` (объём/успех/ошибки/задержка/30д), `contentStats` (топ-темы + распределения по направлению/классу/формату/длительности), `userStats` (всего/активные/новые 30д/топ по генерациям), `communityStats` (лайки/расшарено/топ по like_count/покрытие планов через `source_plan_topic_id`), `eventStats`. Чистые хелперы `lib/admin/format.ts` (`barPercent`/`successRate`, TDD). UI: `components/admin/{SectionCard,KpiCard,BarList,StatTable}` + страница на карточках/таблицах/CSS-bar'ах (без chart-либ).
  - **Events-лог:** таблица `events (id, user_id null, type, meta jsonb, created_at)` (миграция `0009`, индекс `(type, created_at)`); `lib/events/log.ts` `logEvent(type, opts, db?)` — **best-effort** (try/catch, не валит поток, инъекция db, TDD); эмит на успешный экспорт (`meta:{format}`), успешный логин (в `authorize`, динамический import), непустой поиск в библиотеке (`meta:{query}`).
  - Гейты зелёные: `pnpm test` (206 passed / 3 skip — +14 новых), `pnpm lint` (exit 0), `tsc --noEmit`, `pnpm build` (роут `/app/admin` = `ƒ` dynamic). Миграция `0009` применена к dev-БД (smoke зелёный). SQL-инъекций нет (`sql.raw` только с литералами имён колонок).
  - **Технический долг / решения:** `topUsers`/`topShared` — all-time (остальные KPI — 30д, осознанно); экспорты/логины/поиск копятся в `events` только С МОМЕНТА внедрения (ретроспективы до — нет); нет интерактивного date-фильтра, экспорта статистики, управления ролями из UI (только CLI).
  - **Ручной шаг:** назначить первого админа `pnpm set:admin <email>` на проде/деве.
  - **Побочный фикс:** тест `tests/lib/auth/base-url.test.ts` стал детерминированным через `vi.stubEnv` (раньше зависел от ambient `AUTH_URL`; `delete` заменён, т.к. Biome `noDelete`).

### Пост-milestone изменения (на master, вне нумерованных планов)

- **Аудитория «СПО» — ГОТОВО** (коммит `d696958`, спека `docs/superpowers/specs/2026-05-21-spo-audience-design.md`). На РоВ кроме классов 1–11 есть категория СПО. Решение: СПО — полноценная аудитория, хранится **sentinel-числом `grade=12`** в существующей `integer`-колонке (БЕЗ миграции). `lib/scenario/options.ts`: `SPO_GRADE=12`, `formatGrade` (→ «СПО»/«N класс») и `formatGradeForPrompt` (→ «обучающиеся СПО…»). zod `grade` max 11→12. Везде, где класс печатается (форма `/app/new`, редактор, дашборд, экспорт `document-model`, admin-статистика), — через `formatGrade`. Промпты через `formatGradeForPrompt`, `PROMPT_VERSION` → `v4-spo-2026-05-21`. **Pre-match:** для СПО точное `grade=12` (не диапазон ±2, чтобы не смешать с 10–11). **RAG retrieve:** для СПО эффективный `grade=11` (методичек с `grade_min/max=12` нет — тянем старшие). Гейты: tsc, 214 тестов, lint, build. Ручной шаг — живая генерация СПО против GigaChat в браузере.
- **Security/деплой-хардеринг** (коммиты `904c337`, `7e5146a`) — после инцидента с заражением прод-VPS (Mirai-бот через интернет-доступный `next start`; root НЕ получен; вредонос в `~/quarantine`):
  - **next `15.0.3 → 15.5.18`** (закрыт обход middleware-аутентификации), **drizzle-orm `0.36.4 → 0.45.2`** (закрыта SQL-инъекция).
  - **Postgres bind `127.0.0.1:5433`** (в `docker-compose.yml`); пароль вынесен в gitignored `.env` как `${POSTGRES_PASSWORD}` (в репо секрета нет).
  - `.gitignore` ужесточён: `.env`, `.env.*` (кроме `.env.example`), `*.tsbuildinfo`.
  - Секреты ротированы: `GIGACHAT_AUTH_KEY`, `AUTH_SECRET`, пароль БД.
- **Контекст генерации + библиотека сообщества (2026-05-21, на master):**
  - **Расширены справочники `lib/scenario/options.ts` под бриф:** `FORMATS` → 8 (добавлены `киноклуб`, `дебаты`, `проектная сессия`); `DURATIONS` → `20/30/40/60`; `DIRECTIONS` → 11 (супермножество: 8 канонических ФГОС + дословные лейблы брифа `Семейные ценности`, `Профориентация`, `Здоровый образ жизни`). Схема (`z.enum`) и форма `/app/new` строятся из массивов; промпт принимает формат как текст — новые форматы работают без правок промпта; `format` хранится как `text` (без DB-enum).
  - **Редактор:** добавлены add/delete этапов и активностей (`lib/scenario/edit-ops.ts` + кнопки в `editor.tsx`, TDD); защита инвариантов схемы (нельзя удалить последний этап/активность).
  - **Библиотека сообщества наполнена:** `scripts/seed-shared.ts` (+ `pnpm seed:shared`) — seed-владелец `library@planwise.local` (источники изолированы, не для логина), 14 сценариев-источников → обезличенные копии в `shared_scenarios` через прод-логику (`strictPiiCheck` → `embed`). Покрытие: все 8 форматов, новые направления, длительности 20/30/40/45/60. Идемпотентно. Все 14 с эмбеддингом (2560d).
  - **Калибровка порога:** `scripts/calibrate-threshold.ts` починен (был баг хойстинга статического `import db` выше `config()` → `DATABASE_URL is not set`; переведён на ленивый импорт). Прогон: 24 запроса, top-sim 0.69–0.89 (медиана 0.795). `SIMILARITY_THRESHOLD` выставлен **`0.72`** (в `.env.local` и `.env.production` на проде) — дефолт 0.78 отсекал ~25% релевантных. Значение — стартовое, уточнять живым UAT.
- **Живой сквозной UAT golden-path (2026-05-21, на master):** прогнан против прода `176.108.252.98` через Claude-in-Chrome под аккаунтом `UAT` (бэклог-пункт #3 закрыт). Подтверждено вживую против GigaChat: генерация+двухэтапный SSE-стрим (~25 c, прогресс-бар фаз), редактор (правка, ↑/↓ с блокировкой на границах, 🎲-регенерация активности, save+reload персист), неблокирующий PII-warning при сохранении, opt-in shared со строгим PII-gate (контент обезличивается ДО публикации — утечки сырого телефона нет), экспорт PDF (`%PDF`, 50 КБ) и DOCX (`PK`, 10.6 КБ) с подтверждённой кириллицей, календарь + «На дату» + «убрать», 3-й источник темы из повода, лендинг. Чек-лист и отметки — `docs/qa.md §2–3`; трекер — `docs/backlog.md` (#3 → «Сделано»). **Найдено и записано в backlog:** #16 — адрес-детектор PII даёт ложное срабатывание (мангл текста, «формирование…взаимопомощи» → «форм[Адрес_1]имопомощи»; переredact в безопасную сторону, утечки нет); #17 — mobile-адаптив лендинга (закрыт, см. ниже). Тестовые прод-данные после прогона убраны.
- **Замер latency регенерации + раздельные метрики (2026-05-21, на master):** добавлена колонка `generations.kind text NOT NULL DEFAULT 'full'` (`'full'|'regen'`, **миграция `0011`**). `regenerateActivityAction` теперь засекает `Date.now()` и пишет реальный `latencyMs` + `kind:'regen'` (раньше `null`); полные генерации идут с дефолтом `kind:'full'`. `lib/admin/stats.ts`: `avgLatencyMs` заменён на `avgLatencyFullMs`/`avgLatencyRegenMs` (`avg(latency_ms) FILTER (WHERE kind=…)`). `/app/admin`: две KPI-карточки — «Среднее время генерации» (full) и «Среднее время 🎲-регенерации» (в секундах), сетка KPI → `md:grid-cols-3 lg:grid-cols-5`. Гейты: tsc, biome, build, 230 тестов. **Задеплоено на прод 2026-05-21 (`pnpm db:migrate` выполнен, рестарт), работает** — KPI наполняются. **На будущее:** этот деплой требовал миграции (одного `git pull && build && restart` мало — иначе INSERT в `generations` упал бы на отсутствующей колонке `kind`).
- **Mobile-навбар лендинга (2026-05-21, на master):** `components/landing/LandingNavbar.tsx` переведён в client-компонент (`'use client'` + `useState`). До этого на `<md` якорные ссылки (`hidden md:flex`) и «Войти» (`hidden sm:inline-flex`) были скрыты без альтернативы — на телефоне в шапке оставались только логотип и «Начать». Добавлен бургер-тоггл (`md:hidden`, иконки `Menu`/`X` из lucide) с выпадающим меню: якорные ссылки + «Войти» (последняя `sm:hidden`, чтобы не дублировать видимую на sm-md диапазоне), закрывается по клику на пункт. Остальные секции лендинга уже были адаптивны (сетки `grid-cols-1`→`sm:`/`lg:`). Гейты: tsc, biome, build зелёные. **Задеплоено на прод 2026-05-21.** Остаточный нюанс: визуальный reflow на узком viewport на глаз не подтверждён (в подключённом десктоп-Chrome не форсируется ширина <экрана) — глянуть в DevTools device-mode / на телефоне (backlog #17).
- **Прод-окружение (факты, актуальные на 2026-05-21):** VPS `176.108.252.98` (2 vCPU / 4 ГБ + swap 4G в `/etc/fstab`). App запускается **`next start` на `127.0.0.1:3000` за nginx** (`/etc/nginx/sites-available/planwise` → `proxy_pass localhost:3000`), наружу только nginx на `:80`. **`output: 'standalone'` в next.config, но запускается через `next start`** (standalone-предупреждение безвредно; standalone-бандлу не хватает копии `.next/static`). Фаервол **ufw** активен (только `22`, `80`). **Автозапуск настроен (systemd):** unit `deploy/planwise.service` установлен в `/etc/systemd/system/`, `systemctl enable` (запущен через `pnpm exec next start`, абсолютные пути nvm, логи в `/home/nikit/app.log`); Postgres-контейнер с `restart: unless-stopped` в `docker-compose.yml`. App и БД переживают ребут. Деплой новой версии: `git pull && pnpm build && sudo systemctl restart planwise`. GitHub-remote: `git@github.com:Caspernik-dev/s21_planwise.git` (ветка `master`).

### Конвенции работы
- **Один коммит на задачу плана.** Атомарность для отката.
- **TDD для `lib/pii`, `lib/rag/score`, валидаторов и любой нетривиальной логики.** Тесты сначала.
- Перед коммитом каждой задачи — `superpowers:verification-before-completion`.
- Сложные баги — `superpowers:systematic-debugging`, не угадывать.
- Перед мержем фазы — `superpowers:requesting-code-review`. Перед демо — `security-review`.
- При параллельных фазах (например 4 ‖ 5) — `superpowers:using-git-worktrees`.

---

## Available environment (inventory as of 2026-05-18)

### Installed plugins
- **superpowers@claude-plugins-official** v5.1.0 — installed 2026-05-18, path: `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0`.
  Ships skills, hooks, agents (`AGENTS.md`), scripts. Skills become available after CLI restart.

### Plugin skills (superpowers)
- `brainstorming`
- `dispatching-parallel-agents`
- `executing-plans`
- `finishing-a-development-branch`
- `receiving-code-review`
- `requesting-code-review`
- `subagent-driven-development`
- `systematic-debugging`
- `test-driven-development`
- `using-git-worktrees`
- `using-superpowers`
- `verification-before-completion`
- `writing-plans`
- `writing-skills`

### Built-in / preinstalled skills
- Code & review: `code-review:code-review`, `review`, `security-review`, `simplify`, `init`, `frontend-design:frontend-design`, `claude-api`
- Documents (Anthropic): `pptx`, `pdf`, `docx`, `xlsx`, `skill-creator`, `consolidate-memory`, `setup-cowork`
- Obsidian: `obsidian-markdown`, `json-canvas`, `obsidian-bases`, `defuddle`, `obsidian-cli`
- Harness/config: `update-config`, `keybindings-help`, `fewer-permission-prompts`, `loop`, `schedule`

### MCP servers available
- `computer-use` — desktop control (tiered: browsers=read, terminals/IDE=click, other=full). Requires `request_access`.
- `Claude_in_Chrome` — DOM-aware browser automation
- `ccd_session_mgmt`, `ccd_session` — session/chapter management
- `mcp-registry` — search/suggest connectors
- `scheduled-tasks` — cron-like scheduled agents

### Deferred tools (load via ToolSearch before use)
TodoWrite, WebFetch, WebSearch, CronCreate/List/Delete, EnterPlanMode/ExitPlanMode, EnterWorktree/ExitWorktree, Monitor, NotebookEdit, PushNotification, RemoteTrigger, TaskOutput/TaskStop, plus all `mcp__*` tools listed above.

### Memory location
`~/.claude/projects/-home-nikit-planwise/memory/` — index in `MEMORY.md`.
