import { embed } from '@/lib/gigachat/embeddings'
import { __resetTokenCacheForTests } from '@/lib/gigachat/token'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdDp0ZXN0'
  process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  process.env.GIGACHAT_OAUTH_URL = 'https://oauth.example/api/v2/oauth'
  process.env.GIGACHAT_API_BASE = 'https://giga.example/api/v1'
  process.env.GIGACHAT_EMBED_MODEL = 'EmbeddingsGigaR'
  process.env.RAG_EMBED_BATCH = '32'
})

afterEach(() => vi.unstubAllGlobals())

function stub(embeddingFor: (text: string, idx: number) => number[]) {
  const calls: unknown[][] = []
  const fetchMock = vi.fn(async (url: string, init: { body?: string }) => {
    calls.push([url, init])
    if (String(url).includes('/oauth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', expires_at: Date.now() + 1_800_000 }),
      }
    }
    const body = JSON.parse(String(init.body)) as { input: string[] }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: body.input.map((t, i) => ({ embedding: embeddingFor(t, i), index: i })),
      }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

describe('embed', () => {
  it('returns one vector per input string in order', async () => {
    stub((_t, i) => [i, i, i])
    const out = await embed(['a', 'b', 'c'])
    expect(out).toEqual([
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ])
  })

  it('batches inputs by RAG_EMBED_BATCH and preserves global order', async () => {
    process.env.RAG_EMBED_BATCH = '2'
    const { calls } = stub((t) => [t.charCodeAt(0)])
    const out = await embed(['a', 'b', 'c', 'd', 'e'])
    const embedCalls = calls.filter((c) => String(c[0]).includes('/embeddings'))
    expect(embedCalls.length).toBe(3) // 2 + 2 + 1
    expect(out).toEqual([[97], [98], [99], [100], [101]])
  })

  it('returns empty array for empty input without calling fetch', async () => {
    const { fetchMock } = stub(() => [1])
    const out = await embed([])
    expect(out).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on non-ok response', async () => {
    __resetTokenCacheForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/oauth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 't', expires_at: Date.now() + 1e6 }),
          }
        }
        return { ok: false, status: 429, text: async () => 'rate limited' }
      }),
    )
    await expect(embed(['x'])).rejects.toThrow(/embeddings failed: 429/)
  })
})
