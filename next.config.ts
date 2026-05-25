import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // Корень трассировки = директория проекта. Иначе при сборке из git-worktree
  // Next поднимается до основного репозитория и кладёт server.js во вложенный путь
  // (.next/standalone/.claude/worktrees/.../server.js) → образ не находит /app/server.js.
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  outputFileTracingIncludes: {
    // PDF-рендер тянет шрифты PT Sans и QR-PNG из ./assets через path.join(cwd) —
    // путь не трассируется статически, поэтому включаем ассеты вручную для всех
    // роутов, рендерящих экспорт (обычный и публичный по share-токену).
    '/api/scenarios/[id]/export': ['./assets/**'],
    '/api/share/[token]/export': ['./assets/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
}

export default config
