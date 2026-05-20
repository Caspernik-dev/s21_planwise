import { getGigaConfig } from './config'
import { parseSSEBuffer } from './sse'
import { ensureInsecureTls } from './tls'
import { getAccessToken } from './token'
import type { ChatCompletionResponse, ChatResult, GigaMessage } from './types'

export type ChatOptions = { temperature?: number; maxTokens?: number }

export async function chatCompletion(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
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
}

export async function* chatCompletionStream(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
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
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSSEBuffer(buffer)
    buffer = rest
    for (const ev of events) {
      if (ev === '[DONE]') return
      try {
        const j = JSON.parse(ev) as { choices?: Array<{ delta?: { content?: string } }> }
        const piece = j.choices?.[0]?.delta?.content
        if (piece) yield piece
      } catch {
        // keep-alive / служебная строка — пропускаем
      }
    }
  }
}
