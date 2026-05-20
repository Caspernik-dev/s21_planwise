export type GigaConfig = {
  authKey: string
  scope: string
  oauthUrl: string
  apiBase: string
  model: string
  embedModel: string
  insecureTls: boolean
}

export function getGigaConfig(): GigaConfig {
  const authKey = process.env.GIGACHAT_AUTH_KEY
  if (!authKey) throw new Error('GIGACHAT_AUTH_KEY is not set')

  return {
    authKey,
    scope: process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS',
    oauthUrl: process.env.GIGACHAT_OAUTH_URL ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    apiBase: process.env.GIGACHAT_API_BASE ?? 'https://gigachat.devices.sberbank.ru/api/v1',
    model: process.env.GIGACHAT_MODEL ?? 'GigaChat',
    embedModel: process.env.GIGACHAT_EMBED_MODEL ?? 'EmbeddingsGigaR',
    insecureTls: process.env.GIGACHAT_INSECURE_TLS === 'true',
  }
}
