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
- **Локальные LLM запрещены.** Всё связанное с LLM — внешний API: GigaChat для chat + embeddings (EmbeddingsGigaR, 1024 dims). Ключи в `.env.local` через `GIGACHAT_AUTH_KEY`/`GIGACHAT_SCOPE`. Не предлагать sentence-transformers, spaCy-модели, ollama и т.п.
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
- **Планы:** `docs/superpowers/plans/2026-05-20-plan-N-*.md` — 8 последовательных фаз. Plan 1 (Foundation) написан; 2–8 пишутся по факту завершения предыдущего.
- **Стиль-референс:** `design_example/` (Next+Tailwind+shadcn, токены в `design_example/tailwind.config.ts`).

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
  - **Решение пользователя:** seed-контент генерируется через GigaChat, не вручную; живые сетевые шаги (gen-seed, ingest-seed, ingest-razgovor) — **manual/opt-in вне CI** (флаг `RAG_LIVE=1` для guarded-смоук). Реальный ingest + калибровка качества retrieval — **не выполнялись**, это ручной шаг перед демо (Task 8 Step 9 / Task 11 Step 4 в плане). От-scratch `db:down && db:up` не прогонялся (docker-сокет закрыт в sandbox; БД общая между worktree).
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
