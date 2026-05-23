# syntax=docker/dockerfile:1

# ВАЖНО: `next build` ЗАПУСКАЕТСЯ НА ХОСТЕ, не внутри образа.
# Причина: на этом окружении `next build` внутри контейнера детерминированно ломает
# таблицу роутов (route `/` начинает отдавать дашборд `/app`, все страницы становятся
# динамическими) при идентичных Node/файлах/node_modules — баг детерминизма сборки
# Next 15.5.18 под контейнеризацией. Хостовая сборка корректна, поэтому пакуем готовый
# standalone-вывод. Перед `docker build`/`docker compose build` выполнить `pnpm build`.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Мигратор: прогон drizzle-миграций через tsx (CLI-скрипт, НЕ next build — баг роутинга не касается).
FROM base AS migrator
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY db ./db
COPY drizzle.config.ts tsconfig.json ./
CMD ["pnpm", "db:migrate"]

# Рантайм: минимальный образ с host-собранным standalone-сервером.
FROM node:24-bookworm-slim AS runner
WORKDIR /app
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

# Host-собранный standalone-вывод + статика + шрифты для PDF-экспорта.
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static
COPY --chown=nextjs:nodejs assets ./assets

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
