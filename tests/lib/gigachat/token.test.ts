import { __resetTokenCacheForTests, getAccessToken } from '@/lib/gigachat/token'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdDp0ZXN0' // base64 "test:test"
  process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  process.env.GIGACHAT_OAUTH_URL = 'https://oauth.example/api/v2/oauth'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubOAuth(token: string, expiresAt: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_at: expiresAt }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('getAccessToken', () => {
  it('fetches a token and sends Basic auth + scope + RqUID', async () => {
    const fetchMock = stubOAuth('tok-1', Date.now() + 30 * 60 * 1000)
    const tok = await getAccessToken()
    expect(tok).toBe('tok-1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://oauth.example/api/v2/oauth')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Basic dGVzdDp0ZXN0')
    expect(init.headers.RqUID).toBeTruthy()
    expect(String(init.body)).toContain('scope=GIGACHAT_API_PERS')
  })

  it('caches the token across calls while valid', async () => {
    const fetchMock = stubOAuth('tok-cached', Date.now() + 30 * 60 * 1000)
    await getAccessToken()
    await getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes when token is within 60s of expiry', async () => {
    const fetchMock = stubOAuth('tok-soon', Date.now() + 30 * 1000)
    await getAccessToken()
    await getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }),
    )
    await expect(getAccessToken()).rejects.toThrow(/GigaChat OAuth/)
  })
})
