import { chatCompletion } from '@/lib/gigachat/client'
import { __resetTokenCacheForTests } from '@/lib/gigachat/token'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdDp0ZXN0'
  process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  process.env.GIGACHAT_OAUTH_URL = 'https://oauth.example/api/v2/oauth'
  process.env.GIGACHAT_API_BASE = 'https://giga.example/api/v1'
  process.env.GIGACHAT_MODEL = 'GigaChat'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFlow(chatContent: string) {
  const fetchMock = vi.fn(
    async (url: string, _init: { headers: Record<string, string>; body?: string }) => {
      if (String(url).includes('/oauth')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'tok', expires_at: Date.now() + 30 * 60 * 1000 }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: chatContent } }],
          usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
        }),
      }
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chatCompletion', () => {
  it('returns assistant content and usage', async () => {
    stubFlow('привет')
    const r = await chatCompletion([{ role: 'user', content: 'hi' }])
    expect(r.content).toBe('привет')
    expect(r.usage).toEqual({ promptTokens: 11, completionTokens: 22 })
  })

  it('sends Bearer token and model in the chat request', async () => {
    const fetchMock = stubFlow('ok')
    await chatCompletion([{ role: 'user', content: 'hi' }], { temperature: 0.3 })

    const chatCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/chat/completions'))
    if (!chatCall) throw new Error('chat call not found')
    const [url, init] = chatCall
    expect(url).toBe('https://giga.example/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const payload = JSON.parse(String(init.body))
    expect(payload.model).toBe('GigaChat')
    expect(payload.temperature).toBe(0.3)
    expect(payload.stream).toBe(false)
  })

  it('throws on chat non-ok', async () => {
    const fetchMock = vi.fn(
      async (url: string, _init: { headers: Record<string, string>; body?: string }) => {
        if (String(url).includes('/oauth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'tok', expires_at: Date.now() + 1_800_000 }),
          }
        }
        return { ok: false, status: 500, text: async () => 'boom' }
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toThrow(/GigaChat chat/)
  })
})
