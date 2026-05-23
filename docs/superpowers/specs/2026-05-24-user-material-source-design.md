# Загрузка своего материала как основы сценария (backlog #29)

**Статус:** утверждён 2026-05-24
**Источник:** `docs/backlog.md` #29 («📚 Загрузка своего материала как основы сценария»)

## Проблема

Сейчас опора генерации — только глобальный корпус методичек РоВ (`rag_chunks`) и
shared-примеры сообщества. Учитель не может сказать «сделай сценарий ПО моей статье /
конспекту / заметкам». Это сильная дифференциация: учитель приносит свой материал,
сценарий строится прежде всего на нём.

## Зафиксированные решения (из брейншторма)

1. **Привязка — разовая, к одной генерации.** Не персистентная библиотека материалов,
   не ingest в RAG под `user_id`. Материал прикладывается на форме `/app/new` и
   используется ТОЛЬКО для этой генерации.
2. **Роль — первичная опора.** Материал учителя — ГЛАВНЫЙ источник фактов и структуры;
   методички РоВ из RAG вторичны. Промпт явно велит опираться прежде всего на материал.
3. **PII — diff + согласие (паттерн `/app/plans`).** Двухшаговый флоу: анализ показывает
   diff найденных ПДн, учитель подтверждает обезличивание (по умолчанию) ИЛИ даёт явное
   согласие отправить сырой текст. Анонимизация **пересчитывается на сервере** —
   клиентским полям не доверяем.
4. **Длинный материал — чанкинг + retrieval по теме (эфемерный, in-memory).** Файл до
   5 МБ режется на чанки, эмбеддится на лету, выбираются top-K релевантных теме кусков.
   Эмбеддинги **не пишутся в БД** — считаются на критическом пути генерации и
   отбрасываются. Число эмбеддимых чанков ограничено (RAM/латентность).
5. **Интеграция — в `/app/new`** как опциональное вложение (не отдельная страница).

## Архитектура

### Поток

```
форма /app/new
  └─ (опц.) секция «Свой материал»: file-input + «Проанализировать»
        │
        ▼
  analyzeMaterialAction (server action)
    auth → rate-limit → parseFile → detectAndAnonymize
    → { filename, original, anonymized, replacements[] }   (БЕЗ записи в БД)
        │
        ▼
  UI: diff (original → placeholder) + чекбокс согласия
      (текст «…отправлены во внешний сервис GigaChat. Продолжить?» + «понимаю»)
      исходный текст + флаг согласия удерживаются в client-state
        │
        ▼
  генерация: POST /api/generate/stream
    body += material: { text: <original>, consent: boolean }
        │
        ▼ (server, ДО открытия стрима)
  prepareMaterial(text, consent)
    consent===true → сырой текст ; иначе detectAndAnonymize → обезличенный
        │
        ▼
  selectRelevantMaterial(text, query)
    chunkMaterial → cap MATERIAL_MAX_CHUNKS → embed(чанки)+embed(запрос)
    → cosine-ранжирование → top-K в пределах MATERIAL_MAX_CHARS → склейка
    (сбой embed → fallback: первые MATERIAL_MAX_CHARS символов)
        │
        ▼
  streamScenario(input с input.userMaterial=<выбранный текст>)
    buildSkeletonMessages / buildBlockMessages инъектят [TEACHER_MATERIAL]
    как ГЛАВНЫЙ источник (выше [RELEVANT_METHODOLOGY])
```

### Новые модули

- **`lib/material/chunk.ts`** — `chunkMaterial(text: string): string[]`.
  Разбивка по абзацам (пустые строки) с упаковкой в окна ~300–800 «токенов»
  (эвристика `chars/3`, как в `lib/rag/chunk.ts` — локальный токенайзер запрещён).
  Чистая функция. TDD: границы окон, упаковка коротких абзацев, разрезание
  слишком длинного абзаца.

- **`lib/material/retrieve.ts`** — `selectRelevantMaterial(text, query, deps?)`.
  ```ts
  type SelectDeps = {
    embed: (texts: string[]) => Promise<number[][]>
    maxChunks: number   // env MATERIAL_MAX_CHUNKS, деф. 40
    topK: number        // env MATERIAL_TOP_K, деф. 5
    maxChars: number    // env MATERIAL_MAX_CHARS, деф. 6000
  }
  // query: строка `"{direction} {topic}"` (как в retrieveChunks)
  // → { text: string; truncated: boolean }
  ```
  Шаги: `chunkMaterial` → если чанков > `maxChunks`, оставить первые `maxChunks` →
  `embed([query, ...chunks])` → cosine(query, chunk) → сортировка по убыванию →
  набор top-K, пока суммарная длина ≤ `maxChars` → склейка через `\n\n`.
  **Fallback:** при любой ошибке embed — вернуть первые `maxChars` символов
  исходного текста (материал первичен, не дропаем). `truncated` = был ли отброшен текст.
  `embed` инъектируется → юнит-тесты без сети. TDD: ранжирование (мок-embed с
  заданными векторами), соблюдение `topK`/`maxChars`, cap по `maxChunks`,
  fallback при throw из embed.

- **`prepareMaterial(rawText: string, consent: boolean)`** (в `lib/material/index.ts`
  или `material-actions`): `consent === true` → `{ text: rawText, anonymized: false }`;
  иначе `detectAndAnonymize(rawText)` → `{ text: anonymized, anonymized: true, piiCount }`.
  Тривиально, юнит-тест двух веток.

### Изменения существующих модулей

- **`lib/scenario/schema.ts`** — добавить в `generationInputSchema`:
  ```ts
  userMaterial: z.string().max(20_000).optional()
  ```
  Хранится в `scenarios.inputContext` (jsonb) для трассируемости — консистентно с тем,
  что план хранит `work_plans.raw_text` (обезличенный или согласованный сырой).
  Поле опциональное → существующие генерации без материала не ломаются.

- **`lib/scenario/prompt.ts`** —
  `buildSkeletonMessages` и `buildBlockMessages` получают опц. параметр
  `userMaterial = ''`. Когда он непустой — секция в `user`-сообщении ВЫШЕ
  `[RELEVANT_METHODOLOGY]`:
  ```
  [TEACHER_MATERIAL] (ГЛАВНЫЙ источник — опирайся прежде всего на него,
  методички ниже вторичны):
  <материал>
  ```
  В system-инструкции (оба билдера): «Если дан [TEACHER_MATERIAL] — это основной
  источник содержания; строй сценарий прежде всего на нём, методички используй как
  дополнение». Правило фактологичности (#23) расширяется: конкретику можно брать из
  `[TEACHER_MATERIAL]` ИЛИ `[RELEVANT_METHODOLOGY]`.
  `PROMPT_VERSION → 'v8-material-2026-05-24'`.

- **`lib/scenario/stream.ts`** — `streamScenario` пробрасывает `input.userMaterial`
  шестым/седьмым аргументом в `buildSkeletonMessages` и `buildBlockMessages`.
  Больше ничего: материал уже выбран и обрезан в route.

- **`app/api/generate/stream/route.ts`** — после auth+rate-limit, ДО открытия стрима:
  прочитать `body.material` (если есть; форма `{ text: string, consent: boolean }`),
  вызвать `prepareMaterial` → `selectRelevantMaterial({direction, topic})` →
  записать результат в `input.userMaterial`. Ошибки material-подготовки
  не валят генерацию (best-effort, как RAG retrieval).

- **`app/app/new/material-actions.ts`** (новый) — `analyzeMaterialAction`.
  Зеркалит `analyzePlanAction`: auth → `checkRateLimit({key:'material',
  subject:userId, email, limit: MAX_MATERIAL_PER_DAY деф.20, windowMs:86_400_000})`
  → `parseFile` → `detectAndAnonymize` → `{ filename, original, anonymized,
  replacements }`. Без записи в БД. (`useFormState`-совместимая сигнатура.)

- **UI** — секция в форме `/app/new` (рядом с прематч-флоу, независимо):
  свёрнутая «Свой материал (необязательно)» с file-input + кнопкой «Проанализировать»;
  по результату — diff (как в `app/app/plans/upload-form.tsx`) + чекбокс согласия;
  исходный текст и `consent` в client-state передаются в `GenerationStream` →
  в POST `/api/generate/stream`. Кнопка генерации с материалом разблокируется только
  после успешного анализа (как в планах). Если файл не приложен — поток как сейчас.

## Изоляция и безопасность

- Новых таблиц нет → материал эфемерен (живёт в памяти запроса, эмбеддинги
  отбрасываются). Единственный персист — `userMaterial` внутри `inputContext`
  собственного сценария пользователя (`scenarios.user_id` уже изолирует).
- Сервер **никогда не доверяет** клиентскому обезличенному тексту: получает только
  исходный текст + флаг согласия, заново гоняет `detectAndAnonymize`. Согласие —
  строго `consent === true`.
- Rate-limit на `analyzeMaterialAction` (`key:'material'`), whitelist через
  `DEMO_USER_EMAILS` (как у остальных лимитов).
- `selectRelevantMaterial` не строит SQL (чистый in-memory cosine) — инъекций нет.

## Обработка ошибок

- `parseFile` бросает на неподдерживаемом/битом/слишком большом файле → ловится в
  `analyzeMaterialAction`, возвращается `{ error }` (инлайн под инпутом).
- `selectRelevantMaterial`: сбой embed → fallback на cap по символам (не валит).
- material-подготовка в route обёрнута best-effort: ошибка → генерация идёт без
  материала (лог в console.error), а не падает.

## Тестирование (TDD для чистой логики)

- `lib/material/chunk.ts` — границы окон, упаковка, разрез длинного абзаца.
- `lib/material/retrieve.ts` — cosine-ранжирование (мок-embed), `topK`, `maxChars`,
  cap `maxChunks`, fallback при throw из embed, флаг `truncated`.
- `prepareMaterial` — ветка обезличивания vs согласия.
- `buildSkeletonMessages`/`buildBlockMessages` — наличие `[TEACHER_MATERIAL]` и его
  приоритетной формулировки при непустом `userMaterial`; отсутствие секции при пустом.
- Server action / route / UI — интеграционная склейка без юнит-тестов (паттерн проекта);
  проверяются `tsc`/`lint`/`build`.

## Tradeoff (осознанный)

- Эмбеддинг материала добавляет ~один батч-вызов GigaChat на критический путь генерации.
  Ограничен `MATERIAL_MAX_CHUNKS` → латентность предсказуема. Приемлемо для opt-in фичи.
- Согласованный (сырой) материал может содержать PII в `inputContext` —
  консистентно с политикой хранения `work_plans.raw_text` при согласии.
- `chunks/3`-эвристика токенов неточна (локальный токенайзер запрещён) — как везде в RAG.

## Вне scope

- Персистентная библиотека материалов учителя, ingest в RAG под `user_id`,
  переиспользование материала между генерациями (это была отвергнутая альтернатива).
- HNSW-индексы / запись чанков материала в БД.
- Регенерация активности с учётом материала (`regenerateActivityAction` не трогаем —
  материал эфемерен и при регенерации недоступен; допустимое ограничение).
