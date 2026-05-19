# Klassniy Chas — ИИ-генератор сценариев внеурочных занятий

**Date:** 2026-05-20
**Status:** Approved (brainstorming) → ready for implementation planning
**Brief:** `klassniy-chas-brief.md` (Кейс 5 хакатона)

---

## 1. Контекст и цели

Сервис для классных руководителей, советников по воспитанию и педагогов-организаторов.
По заданному контексту (направление воспитания, класс, тема, повод, длительность, формат) и опционально загруженному плану воспитательной работы сервис:

1. Ищет похожие готовые сценарии в библиотеке сообщества (на основе лайков других пользователей).
2. Если пользователь хочет новый — генерирует структурированный сценарий через GigaChat с опорой на RAG-корпус (методички «Разговоры о важном», seed-набор, лайкнутые сценарии сообщества).
3. Даёт редактор, привязку к календарю и экспорт в PDF/DOCX.

**Целевые критерии оценки кейса (100 баллов):** воспроизводимость, качество структуры, интеграция с планом, гибкость редактирования, разнообразие форматов, безопасность/изоляция.

---

## 2. Ограничения

- **Ресурсы:** 2 vCPU / 4 ГБ RAM на проде.
- **LLM:** только внешние API; локальные модели запрещены. Используем GigaChat (chat + EmbeddingsGigaR).
- **Срок:** ~неделя+, команда. MVP должен покрыть все 7 пунктов критериев кейса плюс 4 дополнительных требования (парсинг файлов, защита ПДн, лайки-как-RAG, RAG методичек).
- **Стиль фронта:** строго `design_example/` (Next.js + Tailwind + shadcn/ui, палитра brand/neutral/accent/warm, Inter+Onest).

---

## 3. Архитектура

**Монолит Next.js (App Router) на TypeScript.** Без отдельного бэкенда — Route Handlers и Server Actions делают всё.

```
┌────────────────────────────────────────────────────────────────┐
│                       Next.js (App Router)                     │
│  app/(public)/        — лендинг (адаптирован из design_example)│
│  app/(auth)/          — login / register                       │
│  app/(app)/           — кабинет                                │
│  app/api/             — Route Handlers                         │
│       ├─ generate/    — стрим (SSE), pre-match, RAG, GigaChat  │
│       ├─ upload/      — приём файлов, парсинг, PII             │
│       ├─ likes/       — лайк, opt-in shared                    │
│       ├─ search/      — семантический поиск shared             │
│       └─ export/      — PDF/DOCX                               │
│  lib/                                                          │
│   ├─ gigachat/        — клиент chat + embeddings + retry       │
│   ├─ parse/           — pdf-parse, mammoth                     │
│   ├─ pii/             — regex + словари + детерм. anonymize    │
│   ├─ rag/             — chunking, retrieval, hybrid score      │
│   ├─ prompt/          — шаблоны + few-shot builder             │
│   └─ export/          — PDF (@react-pdf/renderer), DOCX        │
└────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
   PostgreSQL 16 + pgvector       GigaChat API (external)
```

### Стек

- **Framework:** Next.js 15, React 19, Tailwind, shadcn/ui, lucide-react
- **Формы:** react-hook-form + zod
- **Редактор:** TipTap (rich-text внутри блоков). Перемещение блоков — простые кнопки ↑/↓ (drag-handle — в backlog).
- **ORM:** Drizzle (лёгкий по RAM, поддержка pgvector через расширение).
- **Auth:** Auth.js (NextAuth v5), credentials provider, bcrypt cost=10.
- **Парсинг:** `pdf-parse`, `mammoth` (DOCX), нативный TextDecoder для TXT.
- **Экспорт:** `@react-pdf/renderer` (без Puppeteer — экономия RAM), `docx` npm.
- **Деплой:** Docker Compose (Next + Postgres), `output: 'standalone'`, VPS 4 ГБ.

### Принципиальные решения

- **Drizzle, не Prisma** — Prisma engine съедает ~250 МБ RAM, не вписывается в бюджет.
- **`@react-pdf/renderer`, не Puppeteer** — Chrome съест половину RAM.
- **SSE через ReadableStream**, не WebSocket — нативно, дешевле.

---

## 4. Модель данных

9 таблиц.

```
users ─────┬──────< work_plans ──< plan_topics
           ├──────< scenarios ──< scenario_versions
           ├──────< likes
           └──────< calendar_events

rag_documents ──< rag_chunks
shared_scenarios
rate_buckets
```

### Ключевые поля

```sql
scenarios (
  id uuid pk, user_id fk, title text, direction text, grade int,
  duration_min int, format text, topic text,
  source_plan_topic_id fk null, source_shared_id fk null,
  content jsonb,                  -- структурированный сценарий
  input_context jsonb,            -- исходный ввод
  generation_meta jsonb,          -- модель, version промпта, использованные chunk_ids
  embedding vector(1024) null,
  created_at, updated_at
);

likes (id uuid pk, user_id fk, scenario_id fk, opt_in_share boolean default false, created_at);

shared_scenarios (
  id uuid pk, source_scenario_id fk, anonymized_content jsonb,
  direction, grade, duration_min, format, topic,
  embedding vector(1024), like_count int default 1, created_at
);

rag_documents (id uuid pk, source text, title, grade_range, direction, raw_url, created_at);
rag_chunks (id uuid pk, document_id fk, chunk_text text, chunk_meta jsonb,
            embedding vector(1024), tsv tsvector);

generations (id uuid pk, user_id fk, scenario_id fk, prompt_tokens int,
             completion_tokens int, latency_ms int, status text, created_at);

rate_buckets (key text, user_id fk, window_start timestamp, count int, primary key(key, user_id, window_start));
```

### Схема `content jsonb`

```ts
type ScenarioContent = {
  title: string;
  goals: string[];                    // воспитательные результаты
  materials: string[];
  stages: Array<{
    kind: 'engage' | 'main' | 'reflection';
    title: string;
    duration_min: number;
    activities: Array<{
      type: 'discussion'|'quiz'|'game'|'task'|'video';
      text: string;
      questions?: string[];
    }>;
  }>;
  adaptations: { simpler: string; harder: string };
};
```

### Гибридный поиск

- Эмбеддинги: GigaChat `EmbeddingsGigaR`, 1024 dims.
- BM25: PG `to_tsvector('russian', …)` (fallback на `'simple'` через env `PG_TSV_LANG` если словарь недоступен).
- Score = `0.7 * cosine + 0.3 * bm25_norm`.

### Копирование shared в личные

«Использовать как есть» из библиотеки сообщества создаёт **новую** запись в `scenarios` с `source_shared_id` для трейсабилити. Редактирование никогда не затрагивает оригинал.

---

## 5. Пайплайн генерации (вариант B — двухэтапный с пред-рекомендацией)

```
[1] FORM SUBMIT
[2] PARSE & PII
    - если есть файл → text
    - lib/pii.detect → matches
    - lib/pii.anonymize → cleanText + diff
    - если найдено: показываем модалку с diff, авто-анонимизация по умолчанию
    - отмена замены требует подтверждения с явным текстом
      «эти данные будут отправлены во внешний сервис GigaChat»
[3] PRE-MATCH
    - query_vector = embed(direction + grade + topic + format)
    - search shared_scenarios с фильтрами direction/grade±2/format
    - top-3 с similarity >= SIMILARITY_THRESHOLD (env, default 0.78, требует калибровки)
    - клиент показывает карточки + CTA «Сгенерировать новый»
[4] RAG RETRIEVAL
    - 3 чанка из методичек + 2 примера из shared + опц. 1 из user plan
    - diversification: не больше 2 чанков из одного документа
[5] STREAM SKELETON
    - GigaChat call 1: только title/goals/stages[].title+duration
    - partial-json парсер; fallback — skeleton-loader до полного JSON
[6] STREAM DETAILS
    - GigaChat call 2: заполнение этапов по очереди
[7] VALIDATE & SAVE
    - zod валидация ScenarioContent
    - автонормализация хронометража (пропорционально)
    - INSERT scenarios + scenario_versions (initial)
    - embed(input_context+title) → scenarios.embedding
[8] EDIT
    - TipTap-блоки, кнопки ↑/↓ для reorder
    - auto-save debounce 2с → новая запись в scenario_versions
[9] LIKE (opt-in)
    - opt_in_share=true → повторный PII-чек + анонимизация content
    - INSERT/UPDATE shared_scenarios с новым embedding
[10] EXPORT — PDF (@react-pdf/renderer) или DOCX (docx npm)
```

### Промпт

```
[SYSTEM]
Ты методист внеурочной деятельности РФ. Генерируешь сценарии строго по схеме JSON.
Правила: возрастная адаптация, активная роль детей, конкретные вопросы (не общие),
указание ведущей роли педагога, обязательная рефлексия. Никаких реальных имён детей.

[CONTEXT] direction, grade, topic, duration_min, format
[RELEVANT_METHODOLOGY] top-3 RAG chunks
[GOOD_EXAMPLES] top-2 shared scenarios
[OUTPUT_SCHEMA] ScenarioContent JSON only.
```

### Обработка ошибок

| Ошибка | Стратегия |
|---|---|
| GigaChat timeout | Retry × 2 exp backoff → ошибка стрима |
| Невалидный JSON | Repair-pass: «исправь JSON, верни только JSON» |
| Хронометраж > длительности | Автонормализация пропорционально + флаг warning |
| Пустой RAG | Падаем на seed-набор |
| PII в результате | Регенерация с инструкцией «без имён» |
| Rate-limit (юзер) | 429 + понятное сообщение |

---

## 6. PII-сабсистема

### Что детектим

| Категория | Способ |
|---|---|
| Телефон | regex (+7/8 + варианты разделителей) |
| Email | RFC + IDN |
| СНИЛС | regex `\d{3}-\d{3}-\d{3}\s?\d{2}` **без проверки контрольной суммы** |
| Паспорт РФ | `\d{4}\s?\d{6}` в комбинации с контекстом «паспорт» |
| ИНН | 10/12 цифр **без проверки контрольной суммы** (как и СНИЛС) |
| Дата рождения | `\d{1,2}[./-]\d{1,2}[./-](19\|20)\d{2}` + контекст «д.р./родился» |
| Адрес | по ключевым словам «ул./д./кв./г.» с захватом окрестности |
| ФИО | словарь топ-1000 RU-имён (`lib/pii/names.json`) + капитализация + контекст |

### Анонимизация

Детерминированная: одно и то же ФИО → один и тот же плейсхолдер в рамках текста (`Иванов → [Фамилия_1]` везде).

### Точки включения

1. **Загрузка файла плана** — обязательно. Найдено → модалка с diff, авто-замена.
2. **Сохранение сценария** — мягко, warning без блокировки.
3. **Opt-in в shared** — обязательно и строго. Если после первой анонимизации всё ещё что-то найдено — не пускаем, требуем убрать вручную.

### Отмена замены пользователем

Требует подтверждения через модалку с текстом
«Вы отменяете обезличивание. Эти данные будут отправлены во внешний сервис GigaChat. Продолжить?»
+ чекбокс «понимаю». Решение логируется в `generations.meta`.

---

## 7. RAG-сабсистема

### Источники

| Источник | Объём | Загрузка |
|---|---|---|
| «Разговоры о важном» PDF | 30–50 сценариев | `scripts/ingest-razgovor.ts` (КРИТИЧЕСКИЙ ПУТЬ — до старта демо) |
| Seed (свой) | 10–20 эталонов markdown с frontmatter | `scripts/ingest-seed.ts` |
| Shared (растёт) | автоматически при opt-in лайке | trigger в `/api/likes` |

### Чанкинг

- Структурный по заголовкам «Цель / Ход / Этап N / Рефлексия / Материалы».
- Длина 300–800 токенов.
- `chunk_meta`: `{source, document_title, direction, grade_range, section_kind, stage_idx?}`.

### Embeddings

- GigaChat `EmbeddingsGigaR`, 1024 dims.
- Батчинг 32 чанка/запрос.
- Идемпотентность по хэшу `chunk_text`.

### Retrieval

```ts
// псевдокод
SELECT id, chunk_text, chunk_meta,
  (1 - (embedding <=> :qvec)) * 0.7 +
  ts_rank(tsv, plainto_tsquery(:lang, :topic)) * 0.3 AS score
FROM rag_chunks
WHERE chunk_meta->>'direction' = :direction
  AND (chunk_meta->>'grade_min')::int <= :grade
  AND (chunk_meta->>'grade_max')::int >= :grade
ORDER BY score DESC
LIMIT 6;
```

Diversification: не больше 2 чанков из одного документа.

### Калибровка порога

`SIMILARITY_THRESHOLD` для pre-match (default 0.78) обязательно прогнать на 20–30 реальных запросах до демо. Скрипт `scripts/calibrate-threshold.ts` строит распределение и выводит рекомендацию.

---

## 8. UI/UX

### Маршруты

| Маршрут | Назначение |
|---|---|
| `/` | Лендинг (из design_example) |
| `/login`, `/register` | Auth |
| `/app` | Дашборд |
| `/app/new` | Главный экран генерации |
| `/app/scenarios/[id]` | Редактор |
| `/app/library` | Поиск по shared |
| `/app/plans` | Загруженные планы + прогресс |
| `/app/calendar` | Месячная сетка |
| `/app/settings` | Профиль, приватность |

### Экран `/app/new`

**Step 1 — Контекст:** табы источника темы («Из плана» / «Вручную» / «Календарь поводов»), chip-селекторы направления/класса/длительности/формата, drag-drop загрузки плана.

**Step 2 — Pre-match (если есть совпадения):** карточки `ring-1 shadow-card` с похожими готовыми сценариями (название, направление, формат, like_count, превью этапов). CTA «Использовать как есть» (копирует) или «Сгенерировать новый».

**Step 3 — Generation stream:** каркас сценария, заполняемый блоками по мере прихода SSE. Skeleton-блоки с пульсацией. Прогресс-бар «Структура → Этап 1 → … → Готово». Микро-фидбэк «Использованы материалы: …».

**Step 4 — Редактор:** TipTap-блоки, кнопки ↑/↓ для reorder, кнопка «🎲 заменить активность» для точечной регенерации блока, auto-save 2с, toolbar (Лайк, Поделиться, PDF, DOCX, На дату).

### Визуальные акценты

- Бейдж приватности у upload-зоны: «🛡 Локальный детект ПДн, GigaChat получает только обезличенный текст».
- Карточка «Из библиотеки сообщества: N сценариев» в дашборде.
- «Прогресс по плану воспитательной работы» — круг «закрыто 12/30 тем».

### Календарь поводов

Статический массив `lib/calendar-events.ts` ~25 дат `{date, title, suggested_direction, suggested_formats}`. Без LLM-вызовов.

---

## 9. Безопасность и лимиты

### Безопасность

| Слой | Меры |
|---|---|
| Auth | Auth.js, bcrypt cost=10, JWT с rotation, Secure/HttpOnly/SameSite=Lax |
| Авторизация | Drizzle middleware: каждая выборка пользовательских таблиц с `WHERE user_id = session.user.id` |
| CSRF | Auth.js встроенный + проверка origin для Server Actions |
| Файлы | Whitelist MIME (`pdf/docx/txt`), MAX 5 МБ, проверка magic bytes, randomUUID в `/tmp`, удаление после парсинга |
| XSS | React + `isomorphic-dompurify` для HTML в редакторе; запрет HTML при импорте |
| SQL-i | Только параметризованные запросы Drizzle |
| Secrets | `.env.local` + `.env.example` с фейками |

### Лимиты

| Ресурс | Лимит |
|---|---|
| Генерация | `MAX_GENERATIONS_PER_DAY=10` per user, whitelist `DEMO_USER_EMAILS` |
| Загрузка файлов | 20/день/user, 5 МБ каждый |
| Экспорт | 100/день/user |
| Логин | 5 попыток / 15 мин / IP |
| `/api/search` | 60 RPM / user |

### Rate-buckets — lazy cleanup

Без cron. При каждом INSERT в `rate_buckets` сначала DELETE записей старше 24ч для текущего `user_id`:

```ts
await db.delete(rateBuckets).where(and(
  eq(rateBuckets.userId, userId),
  lt(rateBuckets.windowStart, new Date(Date.now() - 86400000))
));
```

---

## 10. Тестирование

| Тип | Покрытие | Стек |
|---|---|---|
| Unit | `lib/pii` (плотно), `lib/rag/score`, validators, prompt builder | Vitest |
| Integration | `/api/generate/*` с mock GigaChat, `/api/upload` с PDF-фикстурой с ПДн | Vitest + supertest |
| E2E (manual) | Регистрация → генерация → лайк → экспорт DOCX | Playwright, **не в CI** |
| Manual checklist | UX edge-кейсы, демо-rehearsal | `docs/qa.md` |

CI: `vitest run` (unit + integration). Playwright — `pnpm test:e2e` локально перед демо.

---

## 11. Скилы Claude Code, задействуемые в реализации

### Process
- `superpowers:brainstorming` (закрыт)
- `superpowers:writing-plans` — следующий шаг после ревью этой спеки
- `superpowers:executing-plans` / `subagent-driven-development` — реализация
- `superpowers:test-driven-development` — `lib/pii`, `lib/rag/score`, валидаторы
- `superpowers:systematic-debugging` — сложные баги (стрим, релевантность)
- `superpowers:verification-before-completion` — перед коммитами
- `superpowers:using-git-worktrees` — параллельные ветки
- `superpowers:dispatching-parallel-agents` — независимые задачи (ingest / ui / pii)

### Implementation
- `frontend-design:frontend-design` — страницы `/app/new`, `/app/scenarios/[id]`, дашборд
- `obsidian:defuddle` — extract контента razgovor.edsoo.ru если есть HTML-страницы
- `anthropic-skills:pdf` — `scripts/ingest-razgovor.ts`
- `anthropic-skills:docx` — рассмотреть для экспорта (альтернатива `docx` npm)
- `code-review:code-review` — перед мержем больших фич
- `security-review` — финальная проверка перед демо
- `simplify` — финальная чистка

### Не используем
- `claude-api` — он про Anthropic SDK; у нас GigaChat (клиент пишем руками)
- GSD-команды — выбираем superpowers как основной фреймворк, чтобы не дублировать

---

## 12. Definition of Done (MVP к демо)

- [ ] Регистрация/вход/выход, изоляция данных по `user_id`
- [ ] Загрузка плана (PDF/DOCX/TXT) с авто-анонимизацией ПДн и diff-превью
- [ ] Парсинг плана → список тем с прогрессом «закрыто/осталось»
- [ ] Форма генерации (направление/класс/тема/длительность/формат) + 3 источника темы
- [ ] Pre-match по shared с порогом, карточки сообщества
- [ ] RAG над методичками (Разговоры о важном) + seed + shared
- [ ] Стриминг скелета → деталей через SSE
- [ ] Редактор сценария (TipTap-блоки, ↑/↓, точечная регенерация активности)
- [ ] Лайк + opt-in shared с повторным PII-чеком
- [ ] Экспорт PDF и DOCX
- [ ] Привязка сценария к дате в календаре
- [ ] Rate-limit и whitelist для демо-аккаунта
- [ ] Лендинг и стиль из design_example
- [ ] Калибровка SIMILARITY_THRESHOLD на ≥20 запросах
- [ ] `russian` tsv словарь проверен в Docker
- [ ] Скринкаст 5–7 мин по сценарию: контекст → генерация → редактирование → экспорт
- [ ] Презентация 8 блоков по структуре кейса

---

## 13. Open questions (не блокируют, решаем по ходу)

- Доступ к razgovor.edsoo.ru: API/массовое скачивание PDF — допустимо ли по ToS? Альтернатива: ручная подборка 10 PDF.
- GigaChat embeddings размер контекста — может потребоваться обрезать длинные чанки.
- Sentry/логирование ошибок в проде — нужно ли в MVP или backlog.

---

## 14. Out of scope (явные исключения)

- Мобильное приложение
- Полноценный OAuth (VK/Yandex)
- Совместное редактирование real-time
- Видео/аудио в сценариях (только текст + ссылки)
- Drag-handle перемещение блоков в редакторе (есть кнопки ↑/↓)
- Cron-jobs (всё lazy)
- Локальные LLM
- Загрузка изображений
- Платная подписка / биллинг
- Многоязычность UI (только русский)
