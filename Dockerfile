# syntax=docker/dockerfile:1

# Сборка из исходников ВНУТРИ контейнера: clone репозитория + `docker compose up`
# поднимает всё без ручного `pnpm build` на хосте.
#
# ВАЖНО: WORKDIR = /build, НЕ /app. Корневая директория не должна называться "app" —
# иначе она коллизит с маршрутом /app (исходник app/app/page.tsx) и Next ломает
# маппинг роут→модуль (route / начинает отдавать дашборд). Урок дорого дался.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /build

# Зависимости отдельным слоем — кэшируется, пока не менялся lockfile.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Сборка Next (standalone). Плейсхолдеры env: Next импортирует модули роутов на
# этапе «collect page data», а db/index.ts бросает при пустом DATABASE_URL.
# Коннекта к БД на сборке нет (postgres-js ленив), значения фиктивные.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime
COPY --from=deps /build/node_modules ./node_modules
COPY . .
RUN rm -rf .next && pnpm build

# Мигратор: прогон drizzle-миграций через tsx (CLI, НЕ next build).
FROM base AS migrator
COPY --from=deps /build/node_modules ./node_modules
COPY db ./db
COPY drizzle.config.ts tsconfig.json package.json ./
CMD ["pnpm", "db:migrate"]

# Рантайм: минимальный образ со standalone-сервером.
FROM node:24-bookworm-slim AS runner
WORKDIR /build
ENV NODE_ENV=production
# Node доверяет системному CA-хранилищу (--use-system-ca), куда вшиваем «Минцифры».
ENV NODE_OPTIONS=--use-system-ca
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Корневые сертификаты «Минцифры РФ» — TLS к GigaChat без обхода проверки.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY deploy/certs/russian_trusted_root_ca.crt deploy/certs/russian_trusted_sub_ca.crt \
  /usr/local/share/ca-certificates/
RUN update-ca-certificates

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /build/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /build/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /build/assets ./assets

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
