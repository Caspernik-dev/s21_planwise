# Email-подтверждение регистрации (soft) + сброс пароля

**Статус:** утверждено 2026-05-31. Источник истины для следующего плана.

## 1. Цель и контекст

Сейчас регистрация Planwise (Auth.js v5 credentials, Plan 1) проходит без верификации email и без механизма восстановления пароля. Это:
- даёт регистрировать аккаунты на чужие/невалидные адреса;
- блокирует пользователя при забытом пароле (единственный путь — ручное вмешательство в БД).

Добавляем два потока поверх существующей credentials-схемы, используя собственный SMTP `mail.caspernik.ru:465` (implicit TLS, Let's Encrypt — Node доверяет из коробки):

1. **Email verification — soft-режим.** Пользователь логинится сразу после регистрации; до клика по ссылке из письма в `/app` висит баннер «подтвердите email» с кнопкой повторной отправки.
2. **Password reset.** Стандартный двухшаговый flow `/forgot` → email со ссылкой → `/reset?token=…`. Доступен в том числе для неподтверждённых email.

Цели:
- Закрыть очевидную дыру MVP перед промышленной эксплуатацией.
- Не блокировать существующий UX (soft-verify не ломает текущим юзерам логин).
- Один деплой: миграция + код, без переконфигурации nginx/Docker.

Не-цели (явно out of scope):
- Смена email из UI, 2FA, OAuth/magic-link, «запомнить меня», device management, react-email шаблоны, очередь писем / retry на уровне приложения, change-email-confirmation.

## 2. Архитектура

Три новых модуля + точечные правки auth-слоя и UI:

```
lib/email/                   SMTP-обёртка (nodemailer)
  client.ts                  фабрика transport из env
  templates.ts               inline HTML+text для verify / reset
  send.ts                    sendVerificationEmail / sendPasswordResetEmail
lib/auth/tokens.ts           issue/consume/invalidate токенов (sha256)
app/auth/verify/page.tsx     consume verify-token → users.email_verified
app/forgot/page.tsx          форма email + forgotPasswordAction
app/reset/page.tsx           форма new password + resetPasswordAction
components/auth/VerifyEmailBanner.tsx
app/app/layout.tsx           рендер баннера при !emailVerified
auth.ts                      passwordVersion в JWT + ленивая проверка
db/migrations/0015_*.sql     users.password_version + auth_tokens
```

### 2.1 `lib/email/` — SMTP-клиент

`client.ts` создаёт singleton `nodemailer.Transporter` из env:

| Env | Назначение | Дефолт |
|---|---|---|
| `SMTP_HOST` | хост SMTP | `mail.caspernik.ru` |
| `SMTP_PORT` | порт | `465` |
| `SMTP_USER` | логин | `planwise@caspernik.ru` |
| `SMTP_PASS` | пароль | — (обязательно) |
| `EMAIL_FROM` | From-адрес | `Planwise <planwise@caspernik.ru>` |
| `APP_URL` | базовый URL для ссылок (fallback на `AUTH_URL`, затем `baseUrlFromRequest`) | — |

`secure: true` (implicit TLS на 465). Без `tls.rejectUnauthorized` хаков — серт публичный.

`templates.ts` — две функции `verifyEmailTemplate(url)` и `passwordResetTemplate(url)`. Возвращают `{subject, html, text}`. Шаблоны:
- русские, в фирменном стиле (минимальный inline CSS — заголовок, кнопка, подвал).
- `text`-вариант обязателен (anti-spam, fallback в почтовых клиентах).
- Ссылка на отписку отсутствует (transactional email, не маркетинг).

`send.ts`:
- `sendVerificationEmail(to, url): Promise<{ok:true} | {ok:false, error:string}>`
- `sendPasswordResetEmail(to, url): Promise<{ok:true} | {ok:false, error:string}>`
- **Ошибки не пробрасываются** наверх — функции всегда резолвятся. Вызывающий код решает, как реагировать (регистрация продолжается даже при сбое SMTP).
- DI: фабрика принимает опциональный `transport` → юнит-тесты подкладывают mock.

### 2.2 `lib/auth/tokens.ts` — модель токенов

Единая таблица `auth_tokens` обслуживает оба потока:

```sql
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,                    -- 'verify' | 'reset'
  token_hash  text NOT NULL UNIQUE,             -- sha256(raw)
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_kind_idx ON auth_tokens (user_id, kind);
```

В БД хранится **sha256(rawToken)**. Сырой токен (32 байта → base64url, ≈43 символа, ≈256 бит энтропии) существует только в URL письма. Утечка дампа БД не даёт восстановить токены.

Публичный API (все принимают `db` через DI для тестов):

| Функция | Поведение |
|---|---|
| `issueToken(userId, kind, ttlSeconds)` | генерит raw + sha256, INSERT, возвращает `{token, expiresAt}` |
| `consumeToken(rawToken, kind)` | hash → SELECT по `token_hash AND kind AND used_at IS NULL AND expires_at > now()` → атомарный UPDATE `used_at = now()` (через `RETURNING user_id`) → возвращает `{userId}` или `null` |
| `invalidateUserTokens(userId, kind)` | UPDATE `used_at = now() WHERE used_at IS NULL` (мягкая инвалидация всех неиспользованных токенов данного типа) |

TTL: `verify = 24 * 3600`, `reset = 3600`.

Cleanup: lazy при `issueToken` — DELETE `WHERE expires_at < now() - interval '7 days'` (как в `rate_buckets`). Без cron.

### 2.3 Изменения auth-слоя

**Миграция 0015:**
- `ALTER TABLE users ADD COLUMN password_version int NOT NULL DEFAULT 1;`
- `CREATE TABLE auth_tokens (…)` как выше.

**`auth.ts` — `passwordVersion` в JWT:**
- В `jwt`-callback при первом вызове (после `authorize`) кладём `token.passwordVersion = user.passwordVersion` и `token.pvCheckedAt = nowSec()`.
- При последующих вызовах: если прошло > `PV_CHECK_INTERVAL_SEC` (дефолт 60) — подтягиваем `users.password_version`, сравниваем; не совпало → возвращаем `null` (force re-login). Совпало → обновляем `pvCheckedAt`. Это компромисс между «дёргать БД на каждый запрос» и мгновенной инвалидацией.
- В `session`-callback пробрасываем `emailVerified` в `session.user` (нужен для баннера и роутинга).

**`Session.user`** дополняется полем `emailVerified: Date | null` (тип расширяется в `auth.ts`).

### 2.4 Server actions и страницы

| Маршрут / action | Auth | Rate-limit | Что делает |
|---|---|---|---|
| `registerAction` (существует) | публичный | `register` 5/15мин/IP (есть) | + после insert юзера: best-effort `issueToken('verify',24h)` + `sendVerificationEmail`. Сбой SMTP логируется, регистрация **не падает**. |
| `app/auth/verify/page.tsx` (GET) | публичный | — | `consumeToken(searchParams.token, 'verify')`. Если успех — `UPDATE users SET email_verified = now() WHERE id = userId AND email_verified IS NULL`, редирект `/app?verified=1`. Если токен невалиден/использован/истёк — страница ошибки с CTA «Войти и отправить заново». Если уже verified — silent success. |
| `resendVerificationAction` (server action на баннере) | требует session | `verify-send` 3/час/user | если уже verified → noop; иначе `invalidateUserTokens('verify')` + `issueToken` + send. Возвращает `{ok, error?}` для toast. |
| `app/forgot/page.tsx` + `forgotPasswordAction` | публичный | `forgot` 5/час/IP | принимает email. Всегда возвращает generic-ответ «если email зарегистрирован, мы отправили письмо». Если юзер существует: `invalidateUserTokens('reset')` + `issueToken('reset',1h)` + send. |
| `app/reset/page.tsx` + `resetPasswordAction` | публичный | `reset-attempt` 10/час/IP | принимает `token`, `password`, `passwordConfirm`. Валидация пароля (≥8 символов, как в register). `consumeToken('reset')` → `UPDATE users SET password_hash=?, password_version=password_version+1, email_verified=COALESCE(email_verified, now())` → редирект `/login?reset=1`. Невалидный токен → дружелюбная ошибка + ссылка на `/forgot`. |

### 2.5 UI

- **`components/auth/VerifyEmailBanner.tsx`** — server component с прокинутыми `email` и `unverified:boolean` из `app/app/layout.tsx`. Внутри — `'use client'` подкомпонент с кнопкой Resend (`useTransition` + локальный toast). Палитра — warm (как PII-warning), фиксированной высоты, не sticky (под navbar). Скрывается, если `emailVerified !== null`.
- **`app/forgot/page.tsx`** — простая центрированная карточка в стиле `/login`: заголовок, описание, `<input type=email>`, submit. Server action возвращает generic «письмо отправлено, если email зарегистрирован».
- **`app/reset/page.tsx`** — карточка с `<input type=password>` ×2, submit. На GET без токена / с битым токеном — карточка ошибки.
- **`/login`** — добавить ссылку `<Link href="/forgot">Забыли пароль?</Link>` под полем password (мелким шрифтом, brand-700).
- **`/login?reset=1`** — небольшой success-баннер «Пароль обновлён, войдите с новым».
- **`/app?verified=1`** — небольшой success-баннер «Email подтверждён».

### 2.6 URL построения ссылок в письмах

Базовый URL: `APP_URL` env → `AUTH_URL` env → `baseUrlFromRequest(headers)` (существующий хелпер). Фиксированные пути:
- verify: `${baseUrl}/auth/verify?token=${rawToken}`
- reset: `${baseUrl}/reset?token=${rawToken}`

Open-redirect не возникает (пути жёстко зашиты, токен — только query).

## 3. Безопасность

| Угроза | Митигация |
|---|---|
| Утечка дампа БД → подделка токенов | sha256-hash в БД; raw token не хранится |
| Перебор токенов | 256-бит энтропии + rate-limit `reset-attempt` 10/час/IP + short TTL |
| User enumeration на `/forgot` | generic-ответ для существующих и несуществующих email |
| Replay использованного токена | single-use через `used_at` + атомарный UPDATE с RETURNING |
| Атакующий с украденным паролем после reset владельца | `password_version+1` инвалидирует все активные JWT (ленивая проверка раз в 60с) |
| Открытый relay через наш SMTP | nodemailer аутентифицируется логином/паролем; SMTP-сервер не наша зона |
| SMTP down → DoS на регистрацию | сбой `sendVerificationEmail` логируется, регистрация продолжается; юзер видит баннер и может Resend |
| Спам через Resend | rate-limit 3/час/user |
| Спам через Forgot | rate-limit 5/час/IP |
| Подмена `EMAIL_FROM` для фишинга | не наша зона — настройки SPF/DKIM/DMARC на `caspernik.ru` |

## 4. Тестирование

**TDD (юнит):**
- `lib/email/templates` — снапшот HTML/text/subject, наличие ссылки в обоих вариантах.
- `lib/auth/tokens` — issue возвращает разные raw для одинаковых аргументов; consume валидного токена возвращает userId и стампит used_at; повторный consume того же токена → null (single-use); истёкший токен → null; чужой kind → null; invalidate помечает все неиспользованные.
- `lib/auth/jwt-pv-check` — выделенный хелпер «нужна ли свежая проверка БД» по `pvCheckedAt` и интервалу.
- `VerifyEmailBanner` (логика рендера) — не показывается при `emailVerified != null`.

**Без юнит-тестов** (тонкая склейка, покрывается tsc/lint/build + ручным UAT): server actions, страницы verify/forgot/reset, изменения `auth.ts`.

**Ручной UAT перед мержем:**
1. Register с реальным email → письмо приходит ≤30с → клик по ссылке → редирект на `/app?verified=1`, баннер пропал.
2. Register → сразу логин (без верификации) → баннер виден → Resend → второе письмо приходит → клик по новой ссылке → verified.
3. Resend 4 раза подряд → 4-й раз показывает «лимит» (3/час).
4. `/forgot` с существующим email → письмо приходит → клик → `/reset?token=…` → задать новый пароль → редирект `/login?reset=1` → войти со старым паролем НЕ работает, с новым работает.
5. `/forgot` с несуществующим email → тот же generic-текст, письмо не отправляется.
6. После успешного reset открыть `/app` во второй вкладке (старая сессия) → в течение 60с редиректит на `/login`.
7. Использовать reset-ссылку дважды → второй раз показывает «токен использован».
8. Подменить SMTP_PASS на неверный → register всё равно проходит, в логах «smtp send failed», баннер с Resend виден.

## 5. Конфигурация (env)

Новые ключи в `.env.example`:

```bash
# SMTP (для email verification и password reset)
SMTP_HOST=mail.caspernik.ru
SMTP_PORT=465
SMTP_USER=planwise@caspernik.ru
SMTP_PASS=replace-me
EMAIL_FROM="Planwise <planwise@caspernik.ru>"
APP_URL=https://plan-wise.ru   # для абсолютных ссылок в письмах

# Внутренние пороги (опционально, всё с дефолтами)
VERIFY_TOKEN_TTL_SEC=86400
RESET_TOKEN_TTL_SEC=3600
PV_CHECK_INTERVAL_SEC=60
MAX_VERIFY_RESEND_PER_HOUR=3
MAX_FORGOT_PER_HOUR=5
MAX_RESET_ATTEMPT_PER_HOUR=10
```

`SMTP_PASS` — секрет, в `.env` (gitignored) на проде, не коммитим. `.env.example` — только плейсхолдер.

## 6. Деплой

Миграция требуется → `git pull && docker compose up -d --build`. Сервис `migrate` применит `0015` идемпотентно перед запуском `app`.

После деплоя — ручной UAT по пп. 1–4 §4. Чек: `SMTP_PASS` прописан в `.env` на проде, иначе письма не уйдут (но регистрация не сломается).

## 7. Зависимости

- `nodemailer` (~1 МБ, без нативных биндингов) — в production deps.
- `@types/nodemailer` — в dev deps.
- Существующие `crypto` (`randomBytes`, `createHash`) — без новых либ.

RAM-бюджет 4 ГБ: nodemailer добавляет ~5 МБ heap при работе с пулом — пренебрежимо.

## 8. Известные ограничения / технический долг

- Инвалидация JWT после reset — ленивая (через `password_version` с проверкой раз в 60с). Окно атаки до 60 секунд. Альтернатива (проверка на каждый запрос) — дороже; приемлемо для текущего масштаба.
- Нет очереди писем / retry: единичный сбой SMTP = пользователь должен нажать Resend. Для всплеска регистраций (десятки в минуту) этого хватит; промышленная очередь — отдельный backlog.
- Нет smoke-теста на реальную доставку в CI — UAT ручной.
- `auth_tokens.kind` — `text`, не enum. Добавление новых видов токенов в будущем (например, `change-email`) не требует миграции схемы.
- Cleanup истёкших токенов — lazy при `issueToken`, без cron. При нулевой регистрации/reset таблица не чистится, но рост линейный и медленный.
