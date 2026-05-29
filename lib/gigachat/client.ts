import { withGigaChatSlot } from './concurrency'
import { getGigaConfig } from './config'
import { parseSSEBuffer } from './sse'
import { ensureInsecureTls } from './tls'
import { getAccessToken } from './token'
import type { ChatCompletionResponse, ChatResult, GigaMessage } from './types'

export type ChatOptions = {
  temperature?: number
  maxTokens?: number
  onQueued?: (position: number) => void
  signal?: AbortSignal
}

export async function chatCompletion(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  return withGigaChatSlot(
    async () => {
      const cfg = getGigaConfig()
      ensureInsecureTls(cfg.insecureTls)
      const token = await getAccessToken()

      const res = await fetch(`${cfg.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 2400,
          stream: false,
        }),
      })

      if (!res.ok) {
        const text = typeof res.text === 'function' ? await res.text() : ''
        throw new Error(`GigaChat chat failed: ${res.status} ${text}`)
      }

      const data = (await res.json()) as ChatCompletionResponse
      const content = data.choices?.[0]?.message?.content ?? ''
      const usage = data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : null

      return { content, usage }
    },
    { onQueued: opts.onQueued, signal: opts.signal },
  )
}

export async function* chatCompletionStream(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  // буферный канал — внешний генератор тянет токены, внутренний пушит
  const chunks: string[] = []
  let done = false
  let errorVal: unknown = null
  let notify: (() => void) | null = null
  const wait = () =>
    new Promise<void>((res) => {
      if (chunks.length > 0 || done) res()
      else notify = res
    })

  const slotPromise = withGigaChatSlot(
    async () => {
      const cfg = getGigaConfig()
      ensureInsecureTls(cfg.insecureTls)
      const token = await getAccessToken()
      const res = await fetch(`${cfg.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 2400,
          stream: true,
        }),
      })
      if (!res.ok) {
        const text = typeof res.text === 'function' ? await res.text() : ''
        throw new Error(`GigaChat stream failed: ${res.status} ${text}`)
      }
      if (!res.body) throw new Error('GigaChat stream: пустое тело ответа')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done: rdone } = await reader.read()
        if (rdone) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSSEBuffer(buffer)
        buffer = rest
        for (const ev of events) {
          if (ev === '[DONE]') return
          try {
            const obj = JSON.parse(ev) as ChatCompletionResponse
            const delta = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content
            if (typeof delta === 'string' && delta.length > 0) {
              chunks.push(delta)
              if (notify) {
                notify()
                notify = null
              }
            }
          } catch {
            // игнор не-JSON SSE кадров
          }
        }
      }
    },
    { onQueued: opts.onQueued, signal: opts.signal },
  )
    .catch((e) => {
      errorVal = e
    })
    .finally(() => {
      done = true
      if (notify) {
        notify()
        notify = null
      }
    })

  while (true) {
    if (chunks.length === 0 && !done) await wait()
    while (chunks.length > 0) yield chunks.shift() as string
    if (done) break
  }
  await slotPromise
  if (errorVal) throw errorVal
}
