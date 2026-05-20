import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/scenarios/[id]/export': ['./assets/fonts/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
}

export default config
