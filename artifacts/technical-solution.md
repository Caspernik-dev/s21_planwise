# Техническое описание решения — Planwise «Классный час»

ИИ-генератор сценариев внеурочных занятий. Кейс 5.
Прод: `https://plan-wise.ru` · Код: `github.com/Caspernik-dev/planwise`.

Документ описывает **реальную реализацию** по четырём обязательным пунктам брифа: интеграция с LLM и промпты, парсинг файлов, хранение данных, ограничение запросов и форматы вывода.

---

## 1. Интеграция с LLM (GigaChat) и используемые промпты

### 1.1 Провайдер и модели

- **Чат-модель:** GigaChat `GigaChat-2-Max` через официальный API `https://gigachat.devices.sberbank.ru/api/v1/chat/completions`.
- **Модель эмбеддингов:** `EmbeddingsGigaR`, размерность **2560**. Используется для гибридного поиска по корпусу методичек и семантического поиска по библиотеке сообщества.
- **Авторизация:** OAuth client_credentials, эндпоинт `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`. Access-токен кэшируется в памяти процесса, обновление за 60 секунд до истечения.
- **Локальные LLM запрещены** (бюджет VPS — 2 vCPU / 4 ГБ RAM). Никаких sentence-transformers / spaCy / Ollama в проде.

### 1.2 Переключаемая через env LLM (опциональный путь без GigaChat)

Реализована абстракция через `LLM_PROVIDER` (`lib/gigachat/config.ts`):

```dotenv
LLM_PROVIDER=gigachat                 # по умолчанию
GIGACHAT_AUTH_KEY=base64(client_id:client_secret)

# ИЛИ — локальная / OpenAI-совместимая модель (Ollama, LM Studio, vLLM):
LLM_PROVIDER=openai
LLM_API_BASE=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=ollama
```

GigaChat API оказался OpenAI-совместимым по форме — отличается только авторизация, поэтому единый клиент `lib/gigachat/client.ts` обслуживает оба варианта без правок остального кода.

### 1.3 TLS-нюанс (Минцифры РФ)

GigaChat использует корневые сертификаты «Минцифры РФ». В проде они **вшиты в Docker-образ** (`deploy/certs/`), `NODE_OPTIONS=--use-system-ca` — проверка TLS работает штатно. Для dev-окружений предусмотрен флаг `GIGACHAT_INSECURE_TLS=true` (отключает проверку только для разработки).

### 1.4 Стриминг (SSE)

- `lib/gigachat/client.ts` → `chatCompletionStream` — async-генератор поверх `fetch + ReadableStream`, парсер SSE-буфера в `lib/gigachat/sse.ts`.
- Реализован собственный `parsePartialJson` (`lib/scenario/partial.ts`) — дополнение оборванного JSON для прогрессивного рендера каркаса.

### 1.5 Промпт-инжиниринг

Все промпты собраны в `lib/scenario/prompt.ts` и `lib/scenario/regenerate.ts`. У каждой версии — константа `PROMPT_VERSION`, она пишется в `generations.prompt_version` для трассируемости. Текущая версия — `v8-material-2026-05-24`.

#### Используются ТРИ типа промптов:

**(а) Skeleton-промпт** — `buildSkeletonMessages`. Один LLM-вызов. Запрашивает каркас занятия:
- Цели (3 пункта)
- Формируемые ценности (2–4 пункта)
- Основные смыслы — заранее распределённые тезисы, чтобы блоки не повторялись
- Список этапов с длительностью
- Для каждого этапа — `blocks[]`: `{type, focus}` — контент-план блоков

Внутри подаются: направление, класс, формат, длительность, тема + секции:
- `[TEACHER_MATERIAL]` — если педагог приложил свой файл (выше методичек)
- `[RELEVANT_METHODOLOGY]` — top-3 чанков «Разговоров о важном» из RAG
- `[GOOD_EXAMPLES]` — top-2 эталона из библиотеки сообщества (только title + список этапов, экономия токенов)

**(б) Per-block-промпт** — `buildBlockMessages`. **По одному LLM-вызову на каждую активность** в каркасе.
- Роль этапа + фокус блока из контент-плана
- `[RELEVANT_METHODOLOGY]` — тот же RAG-контекст
- **Катящаяся сводка соседних блоков** (`buildRunningContext`, ~200 симв./блок) — даёт связность.
- Жёсткое правило: не выдумывать конкретику (даты/имена/цитаты/статистику) без опоры на источники; нет в источниках → подавать гипотетически («представим…»). Снижает галлюцинации.

**Решение «по одному блоку за вызов» — главный инсайт пайплайна.** GigaChat «насыщает» ~800 токенов за вызов; один single-shot даёт «простыню» ~5 КБ. Реальные «Разговоры о важном» — 9–11 плотных блоков (~15–20 КБ). Поэтому объём масштабируется числом блоков, а не «уговорами» модели. Живой замер на проде: 14.6 КБ сценария, ~45 секунд, ноль тонких блоков.

**(в) Regeneration-промпт** — `regenerate.ts` → `buildBlockMessages` повторно используется. Точечная регенерация одной активности с **выбором её типа** учителем. Получает тот же RAG-контекст + катящийся контекст соседей в редактируемом сценарии.

#### Защита от типичных ошибок ИИ (без LLM-судьи)

После каждого блока — детерминированный **гейт качества** (`lib/scenario/quality.ts` → `checkBlock`):

| Проверка | Порог |
|---|---|
| Длина блока | ≥ `MIN_BLOCK_CHARS` (600 симв.) |
| Реплик «Учитель: …» (для engage/main) | ≥ 2, каждая ≥ 40 симв. |
| Вопросов discussion | ≥ 3, каждый со знаком «?» и ≥ 15 симв. |

Тонкий блок переписывается с заострённым корректором до `MAX_BLOCK_RETRIES` раз (по умолчанию 2). Хронометраж нормализуется чисто детерминированно (`normalizeChronometry`) — сумма минут точно равна выбранной длительности, каждый этап ≥ `MIN_STAGE_MINUTES`.

**Почему не LLM-судья:** прототип показал ненадёжность LLM-судьи (false-positives, нестабильные оценки). Детерминированные правила воспроизводимы, бесплатны и быстры.

### 1.6 Валидация выхода

Сырой ответ модели парсится → проходит **zod-валидацию** (`ScenarioContent`, `lib/scenario/schema.ts`). При ошибке — **один repair-pass** (повторный вызов с подсказкой). Если и после этого невалидно — генерация падает с явной ошибкой.

### 1.7 Безопасность: PII до LLM

**Локальная анонимизация ПДн выполняется ДО любого запроса в GigaChat.** Регулярки + словари (`lib/pii/*`) находят телефоны, email, ФИО, СНИЛС, паспорт, ИНН, даты рождения, адреса — без сетевых вызовов. Подробнее — в разделе 4.

---

## 2. Парсинг загружаемых файлов

Единая точка входа — `lib/parse/index.ts`. Используется в двух местах:
- **Загрузка плана воспитательной работы** (`/app/plans`) — затем эвристический разбор на темы.
- **Загрузка своего материала как основы сценария** (`/app/new` → секция «Свой материал») — затем эфемерное чанкование и embedding-retrieval релевантных фрагментов для подмешивания в промпт.

### 2.1 Поддерживаемые форматы

| Формат | Библиотека | Что делает |
|---|---|---|
| **TXT** | `TextDecoder` (нативный) | Чтение UTF-8 |
| **PDF** | `pdf-parse` | Извлечение текстового слоя |
| **DOCX** | `mammoth` | Извлечение текста из OOXML |
| **PPTX** | `jszip` (динамический import) | Распаковка ZIP → парсинг `ppt/slides/slideN.xml`, численная сортировка слайдов, regex по `<a:t[^>]*>…</a:t>` с разэкранированием XML-сущностей; слайды разделены `\n\n` |

Все парсеры работают **в памяти**, без записи в `/tmp` — гарантирует приватность.

### 2.2 Защиты

- **Лимит 5 МБ** на файл (отсечка ДО парсинга).
- **Magic-bytes проверка** (а не только расширение): `%PDF-` для PDF, `PK` для OOXML (DOCX и PPTX как ZIP).
- Свой текст ошибки на формат, чтобы пользователь понимал, что не так.

### 2.3 Постобработка

После парсинга текст проходит **локальную PII-анонимизацию** (см. раздел 4.4) — пользователю показывается **diff**: что нашли и на что заменили. Передача необезличенного текста в GigaChat — только с явным consent (чекбокс с точным текстом про передачу в внешний сервис).

### 2.4 Разбор плана на темы

`lib/plan/parse-topics.ts` — эвристический разбор: маркер списка ИЛИ дата (вытаскивается ДО маркера, формат `DD.MM` / `DD.MM.YYYY`). Сохраняется в `plan_topics` со ссылкой на `work_plans`. На странице плана отображается прогресс «закрыто N из M», темы со сгенерированными сценариями отмечены.

### 2.5 OCR (изображения)

В MVP **не реализовано** (отдельный пункт бэклога #32). Локальный OCR запрещён по бюджету RAM. Архитектура подразумевает использование внешнего vision-API при добавлении (GigaChat-Vision или сторонний сервис) с тем же PII-конвейером после распознавания.

---

## 3. Хранение данных (PostgreSQL + pgvector)

### 3.1 Стек хранения

- **PostgreSQL 16** в Docker с расширением **pgvector** (образ `pgvector/pgvector:pg16`).
- **ORM: Drizzle** (выбран вместо Prisma ради экономии RAM: нет engine-процесса).
- **Векторы** — встроенный тип `vector(2560)` (`pgvector`), индекс HNSW для cosine-расстояния.
- **Full-text** — `tsvector` с конфигурацией `russian` (есть fallback на `simple` через env `PG_TSV_LANG`).
- Drizzle `customType` для `vector` и `tsvector` (`db/types.ts`).
- **13 миграций** — версионированный путь от пустой базы до текущей схемы.

### 3.2 Таблицы

#### Auth (Auth.js v5)
- `users` — email + bcrypt-хэш пароля + `role` (`user`/`admin`).
- `sessions`, `accounts`, `verification_tokens` — стандартные таблицы NextAuth (используется JWT-стратегия, поэтому `sessions` пустая, но оставлена для будущего OAuth).

#### Сценарии
- `scenarios` — id, **user_id** (FK), title, direction, grade, duration_min, format, topic, **content jsonb** (сам сценарий целиком), embedding `vector(2560)` (для будущего поиска по личной коллекции), **share_token** (nullable unique, для read-only ссылки), source_shared_id (если копия из библиотеки), source_plan_topic_id, created_at, updated_at.
- `scenario_versions` — снапшоты `content jsonb` на каждый save / откат / копию. История версий с возможностью восстановления.
- `generations` — метаданные каждой генерации: id, scenario_id, **user_id**, model, prompt_version, latency_ms, success, error_text, **kind** (`'full'` / `'regen'`), thin_blocks, quality_warnings, used_chunk_ids, **rating** (`1`/`-1`/null), **feedback text**, created_at. Питает админ-статистику и виджет оценок 👍/👎.

#### Планы воспитательной работы
- `work_plans` — **user_id**, raw_text, anonymized, created_at.
- `plan_topics` — **user_id**, work_plan_id, title, planned_date, scenario_id (если уже закрыта). Прогресс «закрыто N из M» считается по `scenario_id IS NOT NULL`.

#### RAG-корпус
- `rag_documents` — kind (`'razgovor'`/`'seed'`), source, title, sha256 (для идемпотентного ingest), created_at. **Без user_id** — это общий корпус методичек, доступный всем.
- `rag_chunks` — document_id, content, embedding `vector(2560)`, **tsv tsvector** (для BM25-части гибридного поиска), section_kind, stage_idx, grade_min, grade_max, direction, meta jsonb. HNSW-индекс на embedding, GIN на tsv.

На проде ingest «Разговоров о важном» выполнен: **77 документов / 510 чанков** + 11 seed-сценариев. Покрыты все диапазоны классов (1-2 … 10-11 + СПО).

#### Сообщество
- `likes` — **user_id**, scenario_id, created_at. Unique `(user_id, scenario_id)` — лайк не задваивается.
- `shared_scenarios` — публичная таблица **без user_id** (намеренно): anonymized_content jsonb, embedding `vector(2560)`, like_count, direction, grade, format, duration_min, source_scenario_id (unique), created_at. Запись попадает сюда только через строгий PII-gate.

#### Календарь
- `calendar_events` — **user_id**, scenario_id (FK ON DELETE CASCADE), event_date, title, created_at. Индекс `(user_id, event_date)`. Сетка показывает занятия в порядке учебного года (Сен → Авг). Статический список 25 поводов лежит в коде (`lib/calendar-events.ts`, без LLM).

#### Инфраструктура
- `rate_buckets` — `(key, subject, window_start)` PK, count. Универсальная таблица под все 8 точек rate-limit. `subject` — text (`user_id` ИЛИ `ip`) ради login-лимита по IP.
- `events` — id, user_id (nullable), type, meta jsonb, created_at. Индекс `(type, created_at)`. Питает события для админ-статистики (экспорты, логины, поиски в библиотеке).

### 3.3 Изоляция данных (критерий жюри)

**Жёсткое правило проекта:** ни одного raw SQL без `WHERE user_id = ?` для пользовательских таблиц. Проверка выполнена холистическим ревью на каждом фазовом коммите. Единственная публичная таблица — `shared_scenarios`, у неё user_id намеренно отсутствует; «использование» из библиотеки создаёт **копию** в `scenarios` под текущим пользователем.

Серверная авторизация: middleware Auth.js гейтит весь префикс `/app/*`. Каждый Server Action / Route Handler берёт `userId` из сессии независимо от клиента — клиентским полям не доверяем.

---

## 4. Обязательная реализация

### 4.1 Rate-limit на пользователя

Реализация — `lib/ratelimit/*` + таблица `rate_buckets`.

- **Чистая логика** в `lib/ratelimit/index.ts` (`checkRateLimit(check, deps)`) над инъектируемым `RateStore` — позволяет unit-тестировать без БД.
- **Drizzle-адаптер** `dbStore` — `onConflictDoUpdate` для атомарного инкремента счётчика в окне.
- **Lazy cleanup**: при каждом `INSERT` в `rate_buckets` стирается всё старше 24 часов — без cron-процессов и системных служб.
- **Whitelist** через env `DEMO_USER_EMAILS` — байпас для жюри (через запятую). Whitelist по userId, не по IP.

**Точки применения** (всего восемь):

| Эндпоинт | Лимит по умолчанию | Subject |
|---|---|---|
| `POST /api/generate/stream` (генерация) | `MAX_GENERATIONS_PER_DAY=10`/день | userId |
| `regenerateActivityAction` (🎲) | `MAX_REGEN_PER_DAY=40`/день | userId |
| `useSharedAsIsAction` (копия из библиотеки) | `MAX_COPY_PER_DAY=50`/день | userId |
| `prematchAction` (поиск похожих) | `MAX_PREMATCH_PER_DAY=60`/день | userId |
| Login (`signIn` credentials) | 5 попыток / 15 мин | IP |
| `analyzePlanAction` (загрузка плана) | 20/день | userId |
| `analyzeMaterialAction` (загрузка материала) | 20/день | userId |
| Export PDF/DOCX (`/api/scenarios/[id]/export`) | 100/день | userId |
| Public share export (`/api/share/[token]/export`) | 200/день | share_token |
| Search в библиотеке (`/api/search`) | 60 RPM | userId |

Превышение → HTTP `429`. Для SSE-стрима — проверка **ДО открытия стрима**, чтобы не оставлять «висящие» соединения.

### 4.2 Форматы экспорта

#### PDF (фирменный)

Реализация: `lib/export/to-pdf.tsx` через **`@react-pdf/renderer` v4** (декларативный JSX-рендер, без headless-браузера).

- **Шрифты PT Sans** (regular+bold, OFL-лицензия) вшиты в репозиторий и в Docker-образ через `outputFileTracingIncludes` (`assets/fonts/`). Гарантирует корректную кириллицу в любом PDF-вьюере.
- **Фирменный бланк:** шапка с лого-маркой (SVG-примитивы `Svg`/`Path`, без растеризации), мета-блок в фирменной палитре brand-50/brand-100, акцентные полоски brand-500, фирменные буллеты. Палитра из `design_example` вписана вручную (Tailwind в `@react-pdf` не работает).
- **Фиксированный футер** на каждой странице: дисклеймер «Сценарий создан ИИ. Проверьте факты…» + номер страницы.
- **QR-промо** («Создано в Planwise», QR на `plan-wise.ru`) — пришпилен внизу последней страницы, **если влезает**. Запечён в статичный PNG (`assets/promo-card.png`) — иммунный к багу субсеттинга шрифтов в `@react-pdf/renderer` v4, который ронял первые латинские глифы.
- **Renderer'у дают два прохода**: первый без промо для замера числа страниц, второй с промо в `position:absolute` — если число страниц совпадает. Без лишних пустых страниц.

#### DOCX (редактируемый)

Реализация: `lib/export/to-docx.ts` через **`docx` v9**. Times New Roman (без embed), методический бланк.

#### Единая модель документа

`lib/export/document-model.ts` (`buildScenarioDocument`) — чистый маппер `ScenarioContent + ExportMeta → DocBlock[]` (heading / paragraph / bullets / metaTable). Используется и PDF-, и DOCX-рендером — гарантирует одинаковую структуру. Диспетчер в `lib/export/index.ts` (`renderScenarioExport`).

#### HTTP-роут

`GET /api/scenarios/[id]/export?format=pdf|docx` — runtime `nodejs`, auth → 401, валидация формата → 400, **изоляция `WHERE id AND user_id`** → 404, заголовок `Content-Disposition` с RFC 5987 `filename*` UTF-8 (русские имена файлов корректно отдаются во все браузеры).

### 4.3 Воспроизведение и шаринг

#### Персональная read-only ссылка

Колонка `scenarios.share_token text NOT NULL UNIQUE` (миграция `0012`). Токен генерируется `randomBytes(24)` (`lib/share/token.ts`) → base64url, ≈192 бита энтропии (не угадывается). Включение / отзыв — server actions `enableShareLinkAction` / `disableShareLinkAction` в редакторе. Отзыв → `share_token = NULL`, старая ссылка отдаёт 404.

**Публичная страница** `app/s/[token]/page.tsx`:
- Лежит **вне** `/app/*` — middleware Auth.js не гейтит.
- Поиск строго по `share_token` (не по id) — нельзя угадать чужой сценарий.
- Наружу отдаются **только `content` + 5 мета-полей** (направление, класс, длительность, формат, тема). Никаких user_id, email, inputContext, userMaterial.
- Логотип Planwise + CTA «Зарегистрироваться». Кнопки **PDF/DOCX-экспорта** прямо со страницы (без входа).
- Залогиненный пользователь видит «Скопировать себе» → создаётся копия в его коллекции, токен в копии не наследуется.

**Публичный экспорт** `GET /api/share/[token]/export?format=pdf|docx` — без auth, rate-limit по токену (200/день).

#### Полноэкранный режим показа на проекторе

Реализация: `components/scenario/PresentationMode.tsx` + `lib/scenario/slides.ts` (`buildSlides`).

- Кнопка «Показ» в редакторе → клиентский overlay `fixed inset-0` поверх всего viewport.
- `requestFullscreen()` best-effort (на iOS Safari fullscreen-API ограничен, поэтому overlay всё равно накрывает экран).
- Слайды: титульный (название + бейджи направление / класс / длительность / формат) + **по одному слайду на этап**. Контент тезисный: вопросы (если есть) → буллеты, иначе → текст активности.
- Навигация: ← / → / Space / **PageUp / PageDown** (для презентационных кликеров) / экранные «Назад» / «Далее». Esc — выход.
- Адаптивные шрифты под телефон (`text-3xl sm:text-5xl`), длинный текст прокручивается внутри overlay.

#### Блочный редактор (не WYSIWYG / не rich-text)

**Принципиальное решение:** редактор **НЕ** на TipTap / Lexical / ProseMirror. Содержимое — строго типизированный `ScenarioContent` (zod-схема). Без HTML, без XSS-рисков, без визуальной свободы, ломающей структуру методички.

Что умеет редактор (`components/scenario/editor.tsx`):
- Правка title, целей, ценностей, материалов, заголовков этапов, длительности, текста активностей и вопросов (контролируемые `input`/`textarea`).
- **↑/↓ reorder** этапов и активностей с блокировкой на границах. Чистые иммутабельные операции в `lib/scenario/edit-ops.ts` (`moveStage`/`moveActivity`, TDD).
- **Add / Delete** этапов и активностей. Защита инвариантов схемы (нельзя удалить последний этап / активность).
- **🎲 Точечная регенерация** одной активности с **выбором её типа** (engage/main/discussion/reflection/game/debate/...). Регенерация переиспользует per-block-пайплайн с катящимся контекстом соседних блоков.
- **Explicit save** (НЕ автосейв, осознанно) с dirty-индикатором.
- **История версий с откатом**: панель «История» → список снапшотов → read-only предпросмотр → «Восстановить» (inline-подтверждение). Откат = новая версия, прежнее состояние не теряется.
- Привязка к календарю («На дату» → `/app/calendar` с месячной сеткой).
- Лайк + opt-in шаринг в библиотеку сообщества (с повторным строгим PII-чеком).
- Оценка 👍/👎 с необязательным отзывом — пишется в `generations.rating`/`feedback`.
- **Постоянный баннер** «⚠ Сценарий создан ИИ. Перед уроком проверьте факты — даты, имена, цитаты, числа.» — честно предупреждает учителя.

#### Защита и приватность экспорта/ссылок

- Все экспорт-роуты проверяют принадлежность `(WHERE id AND user_id)` — нельзя скачать чужой PDF подменой id.
- Share-токены не угадываются (~192 бита).
- При **opt-in шаринге** в библиотеку — анонимизация content + **повторная** ре-детекция PII; если что-то осталось — публикация блокируется.

---

## 5. Дополнительные технические свойства (контекст к 4 пунктам)

- **Безопасность инфры:** Docker Compose, nginx + HTTPS (Let's Encrypt с автопродлением), `ufw` (открыты только 22 / 80 / 443), Postgres `bind 127.0.0.1:5433`, секреты в gitignored `.env`. Пакеты обновлены, после реального инцидента с Mirai-ботом проведён security-hardening (next `15.0.3 → 15.5.18`, drizzle-orm `0.36.4 → 0.45.2`, ротация секретов).
- **Тесты:** ~320 unit/integration тестов через Vitest. TDD-покрытие критичной логики: `lib/pii`, `lib/ratelimit`, `lib/rag/score`, `lib/scenario/normalize`, `lib/scenario/quality`, `lib/scenario/edit-ops`, `lib/calendar/events`, `lib/community/pii-gate`, `lib/share/token`.
- **Линт/типы:** Biome (вместо ESLint+Prettier, экономия RAM при сборке) + `tsc --noEmit`. Гейты `pnpm test && pnpm lint && pnpm build` зелёные на каждом коммите.
- **Деплой:** одна команда — `git pull && docker compose up -d --build`. Миграции прогоняются сервисом `migrate` автоматически.
- **Документация репозитория:** `README.md` (запуск и переменные окружения), `docs/backlog.md` (трекер доработок), `docs/qa.md` (UAT-чек-лист), `docs/superpowers/{specs,plans}/*` (полные спеки и планы по 10 фазам), `lib/changelog.ts` (страница изменений на сайте, `/changelog`).

---

**Резюме:** все четыре пункта закрыты в реализации, проверены вживую на проде и покрыты тестами. Тонкие места (`PII-инвариант`, изоляция по `user_id`, утечка приватных полей в share-ссылке, race в rate-limit) проверены холистическим ревью и `security-review` перед сдачей.
