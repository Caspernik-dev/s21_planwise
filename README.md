# Классный час — ИИ-генератор сценариев внеурочки

Хакатонный MVP. Генерирует структурированные сценарии классных часов, квизов, бесед и мастерских с опорой на методички и лайки сообщества.

## Требования

- Node 20+
- pnpm 9+
- Docker (для Postgres+pgvector)

## Быстрый старт

```bash
cp .env.example .env.local
# заполнить AUTH_SECRET (openssl rand -base64 32) и опционально GIGACHAT_*

pnpm install
pnpm db:up           # поднять Postgres+pgvector
pnpm db:migrate      # применить миграции
pnpm dev             # http://localhost:3000
```

## Скрипты

| Скрипт | Что делает |
|---|---|
| `pnpm dev` | Dev-сервер на :3000 |
| `pnpm build` | Production build |
| `pnpm test` | Unit + integration через Vitest |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome format |
| `pnpm db:up` / `db:down` | Postgres контейнер |
| `pnpm db:generate` | Сгенерировать миграцию из `db/schema.ts` |
| `pnpm db:migrate` | Применить миграции |
| `pnpm db:studio` | Drizzle Studio (просмотр БД) |

## Текущий статус

Plan 1 (Foundation) — готов. Регистрация, вход, защищённый `/app`-шелл.
Следующее: Plan 2 — генерация v0 single-shot.

## Документы

- Spec: `docs/superpowers/specs/2026-05-20-klassniy-chas-design.md`
- Plans: `docs/superpowers/plans/`
- Brief кейса: `klassniy-chas-brief.md`
