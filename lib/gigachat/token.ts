import { getGigaConfig } from './config'
import { ensureInsecureTls } from './tls'
import type { OAuthResponse } from './types'

type CacheEntry = { token: string; expiresAt: number }
let cache: CacheEntry | null = null

const REFRESH_MARGIN_MS = 60_000

export function __resetTokenCacheForTests() {
  cache = null
}

export async function getAccessToken(): Promise<string> {
  const cfg = getGigaConfig()

  // OpenAI-совместимый провайдер (локальная LLM / OpenAI): статический Bearer-ключ,
  // без OAuth-обмена. Может быть пустым для keyless-эндпоинтов (Ollama).
  if (cfg.provider === 'openai') return cfg.apiKey

  if (cache && cache.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cache.token
  }

  ensureInsecureTls(cfg.insecureTls)
  const body = new URLSearchParams({ scope: cfg.scope })

  const res = await fetch(cfg.oauthUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${cfg.authKey}`,
      RqUID: crypto.randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`GigaChat OAuth failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as OAuthResponse
  cache = { token: data.access_token, expiresAt: data.expires_at }
  return cache.token
}
