# QA / UAT чек-лист (перед демо)

Финальная проверка MVP «Классный час» перед скринкастом и презентацией.
Источник критериев: спека §10/§12.

## 0. Подготовка окружения
- [ ] `.env.local` с реальным `GIGACHAT_AUTH_KEY` (base64 `client_id:client_secret`), `GIGACHAT_SCOPE=GIGACHAT_API_PERS`
- [ ] `pnpm db:up && pnpm db:migrate` (включая `0008_*` — таблица `calendar_events`)
- [ ] `pnpm seed:demo` → создаёт демо-аккаунт; добавить его email в `DEMO_USER_EMAILS` в `.env.local` (снимает лимиты для жюри)
- [ ] `pnpm exec tsx scripts/ingest-razgovor.ts` (RAG-корпус методичек) + `pnpm ingest:seed`

## 1. Ручные проверки окружения (требуют живого Docker/GigaChat)
- [ ] **Словарь `russian` в `to_tsvector`** (§12). В psql выполнить:
      `SELECT to_tsvector('russian', 'дружба и взаимопомощь');`
      Если ошибка «text search configuration russian does not exist» — выставить `PG_TSV_LANG=simple` в `.env.local` и перепроверить гибридный поиск (`/app/library`, prematch).
- [ ] **Калибровка порога** (§7). `pnpm calibrate` на ≥20 запросах (скрипт уже содержит 24). Оценить распределение top-sim, выставить `SIMILARITY_THRESHOLD` по разрыву между релевантными и нерелевантными. Требует наполненной `shared_scenarios` (несколько opt-in шарингов).

## 2. E2E (golden path) — ручной прогон в браузере
> Прогнан против прода 2026-05-21 (живой GigaChat, аккаунт UAT) — см. отметки.
- [ ] Регистрация нового пользователя → редирект в `/app` _(не проверено — UAT шёл под уже залогиненным аккаунтом)_
- [x] `/app/new`: задать контекст → «Подобрать похожие» → «Сгенерировать новый» _(при отсутствии совпадений pre-match → сразу генерация)_
- [x] Стрим: скелет → детали без ошибок, прогресс-бар _(~25 c, фазы Структура→Детализация→Проверка→Сохранение)_
- [x] Редактор: правка блока, кнопки ↑/↓ (с блокировкой на границах), «🎲 заменить активность» (DISCUSSION→GAME), save+reload персист
- [x] **PII-warning**: вставить телефон в активность, сохранить → виден неблокирующий warning (warm-баннер), сценарий всё равно сохранён
- [x] Лайк + opt-in shared → строгий PII-чек обезличил контент до публикации (плейсхолдер в библиотеке, сырого телефона нет, ♥1)
- [x] Экспорт PDF и DOCX — файлы открываются, кириллица корректна _(валидные %PDF/PK; кириллица в PDF и DOCX подтверждена скачиванием)_
- [x] **Календарь**: `/app/calendar` показывает поводы по месяцам (учебный год Сен→Авг); «На дату» из редактора → запись появляется в секции «Ваши занятия на датах»; «убрать» удаляет привязку
- [x] **3-й источник темы**: `/app/new` вкладка «Календарь поводов» подставляет тему; переход с `/app/calendar` по поводу префилит тему и выбирает вкладку «Календарь поводов»

## 3. Лендинг (визуальная QA — НЕ покрыто автотестами)
- [x] `/` (без логина): sticky navbar, hero, 4 feature-карточки с тенями, How-it-works (3 шага), Audience, CTA, footer
- [x] Палитра/типографика совпадают с `design_example/` (brand-green, Inter+Onest, shadow-card/hover)
- [ ] Адаптив: проверить mobile (≤640px) и desktop — сетки перестраиваются, текст не ломается _(desktop ОК; mobile не проверен — окно браузера не сжалось ниже ширины экрана при headless-прогоне)_
- [x] Все CTA ведут на `/register` и `/login`; якорные ссылки навбара скроллят к секциям (`#features/#how/#audience`)
- [x] Весь текст на русском

## 4. Изоляция данных (jury-критерий)
- [ ] Под пользователем A: создать сценарий + привязку к дате (`/app/calendar`)
- [ ] Под пользователем B: `/app`, `/app/calendar`, `/app/library`, `/app/plans` — данные A НЕ видны
- [ ] Попытка открыть `/app/scenarios/<id чужого сценария>` под B → не найдено

## 5. Лимиты (rate-limit)
- [ ] Не-whitelist пользователь: >10 генераций/день → 429 с понятным сообщением
- [ ] Регенерация активности / «использовать как есть» / prematch — лимиты срабатывают при превышении (`MAX_REGEN_PER_DAY`/`MAX_COPY_PER_DAY`/`MAX_PREMATCH_PER_DAY`)
- [ ] Демо-аккаунт (в `DEMO_USER_EMAILS`): лимиты НЕ срабатывают

## 6. Security
- [ ] Logout с чужого origin → 403. Проверка:
      `curl -i -X POST http://localhost:3000/app/logout -H 'Origin: https://evil.com' -H 'Cookie: <sess>'` → `403`
- [ ] Logout с правильного origin (через UI «Выйти») → редирект на `/`
- [ ] Финальный `security-review` по ветке пройден, HIGH-находки закрыты

## 7. Docker-деплой (self-host / прод) — добавлено 2026-05-23
Прод запускается через `docker compose` (app+db+migrate), сборка из исходников в контейнере. Проверять при деплое/раздаче:
- [ ] **Бэкап БД до операций:** `docker exec kc-postgres pg_dump -U kc kc | gzip > ~/kc-backup-$(date +%F-%H%M).sql.gz` (файл не пустой, мегабайты)
- [ ] **Volume переиспользуется (НЕ создаётся пустой):** `docker inspect kc-postgres --format '{{range .Mounts}}{{.Name}}{{end}}'` = `planwise_kc-pgdata`, и `docker compose config --volumes` = `kc-pgdata` (проект `planwise`)
- [ ] **`.env` собран** (на проде — один файл): `POSTGRES_PASSWORD`, `AUTH_SECRET`, `AUTH_URL=http://176.108.252.98`, `GIGACHAT_AUTH_KEY`, `SIMILARITY_THRESHOLD`, `PG_TSV_LANG`. **НЕ** должно быть `NODE_TLS_REJECT_UNAUTHORIZED`/`GIGACHAT_INSECURE_TLS=true` (серты вшиты в образ)
- [ ] **Сборка+запуск:** `docker compose up -d --build` → `migrate` завершился (`Done.`, идемпотентно), `db` healthy, `app` Ready без `UntrustedHost`/DB-ошибок
- [ ] **Роутинг (анти-регресс бага WORKDIR):** `curl localhost:3000/` → **200 лендинг** (НЕ дашборд/редирект на /login); `/login` → 200; `/app` → 307 `/login?next`
- [ ] **Данные целы:** `docker exec kc-postgres psql -U kc -d kc -c "select count(*) from rag_documents, ..."` совпадает с ожидаемым (на проде ≈ docs 88 / chunks 529)
- [ ] **TLS к GigaChat без обхода:** `docker compose exec app node -e "fetch('https://gigachat.devices.sberbank.ru/api/v1/models').then(r=>console.log(r.status)).catch(e=>console.log('ERR',e.message))"` → статус (401 ок = handshake прошёл), НЕ `ERR ... certificate`
- [ ] **Через nginx:** `curl -sI http://176.108.252.98/ | head -1` → 200; живая генерация в браузере под аккаунтом
- [ ] **Откат при провале:** `docker compose down && sudo systemctl enable --now planwise` (unit `deploy/planwise.service` остаётся установлен, `disable`-нут)
- [ ] **Self-host у получателя:** `git clone` → `cp .env.example .env` (заполнить) → `docker compose up -d` собирает из исходников; для локальной LLM — `LLM_PROVIDER=openai` + `LLM_API_BASE`/`LLM_MODEL`/`LLM_API_KEY` (caveat: смена embed-модели ломает RAG без пере-ingest)

## Известные backlog-пункты (не блокируют демо)
- Явная вкладка «Из плана» в `/app/new` (сейчас поток покрыт переходом со страницы планов через `?planTopicId=`)
- Drag-handle перемещение блоков в редакторе (есть кнопки ↑/↓)
- Playwright E2E автоматизация (`pnpm test:e2e`) — ручной прогон перед демо, НЕ в CI

## Вне scope кода (отдельные демо-артефакты)
- Скринкаст 5–7 мин: контекст → генерация → редактирование → экспорт
- Презентация 8 блоков по структуре кейса
