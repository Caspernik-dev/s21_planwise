export type LlmProvider = 'gigachat' | 'openai'

export type GigaConfig = {
  provider: LlmProvider
  authKey: string
  apiKey: string
  scope: string
  oauthUrl: string
  apiBase: string
  model: string
  embedModel: string
  insecureTls: boolean
}

export function getGigaConfig(): GigaConfig {
  const provider: LlmProvider = process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'gigachat'
  const authKey = process.env.GIGACHAT_AUTH_KEY ?? ''
  if (provider === 'gigachat' && !authKey) throw new Error('GIGACHAT_AUTH_KEY is not set')

  return {
    provider,
    authKey,
    apiKey: process.env.LLM_API_KEY ?? '',
    scope: process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS',
    oauthUrl: process.env.GIGACHAT_OAUTH_URL ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    apiBase:
      process.env.LLM_API_BASE ??
      process.env.GIGACHAT_API_BASE ??
      'https://gigachat.devices.sberbank.ru/api/v1',
    model: process.env.LLM_MODEL ?? process.env.GIGACHAT_MODEL ?? 'GigaChat-2-Max',
    embedModel:
      process.env.LLM_EMBED_MODEL ?? process.env.GIGACHAT_EMBED_MODEL ?? 'EmbeddingsGigaR',
    insecureTls: process.env.GIGACHAT_INSECURE_TLS === 'true',
  }
}
