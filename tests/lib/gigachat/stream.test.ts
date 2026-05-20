import { chatCompletionStream } from '@/lib/gigachat/client'
import { __resetTokenCacheForTests } from '@/lib/gigachat/token'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
}

function stubStream(chunks: string[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/oauth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', expires_at: Date.now() + 30 * 60 * 1000 }),
      }
    }
    return { ok: true, status: 200, body: streamFromChunks(chunks) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chatCompletionStream', () => {
  beforeEach(() => {
    __resetTokenCacheForTests()
    process.env.GIGACHAT_AUTH_KEY = 'dGVzdA=='
    process.env.GIGACHAT_SCOPE = 'GIGACHAT_API_PERS'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('собирает дельты контента и завершается на [DONE]', async () => {
    stubStream([
      'data: {"choices":[{"delta":{"content":"Привет"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", мир"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    let out = ''
    for await (const piece of chatCompletionStream([{ role: 'user', content: 'hi' }])) {
      out += piece
    }
    expect(out).toBe('Привет, мир')
  })

  it('склеивает дельты, разорванные между чанками', async () => {
    stubStream([
      'data: {"choices":[{"delta":{"content":"А"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":"Б"}}]}\n\ndata: [DONE]\n\n',
    ])
    let out = ''
    for await (const piece of chatCompletionStream([{ role: 'user', content: 'hi' }])) {
      out += piece
    }
    expect(out).toBe('АБ')
  })
})
