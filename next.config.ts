import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // Корень трассировки = директория проекта. Иначе при сборке из git-worktree
  // Next поднимается до основного репозитория и кладёт server.js во вложенный путь
  // (.next/standalone/.claude/worktrees/.../server.js) → образ не находит /app/server.js.
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/scenarios/[id]/export': ['./assets/fonts/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
}

export default config
