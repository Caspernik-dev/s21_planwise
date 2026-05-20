import { getGigaConfig } from './config'
import { getDispatcher } from './dispatcher'
import { getAccessToken } from './token'
import type { ChatCompletionResponse, ChatResult, GigaMessage } from './types'

export type ChatOptions = { temperature?: number; maxTokens?: number }

export async function chatCompletion(
  messages: GigaMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const cfg = getGigaConfig()
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
    // @ts-expect-error undici-only option, игнорируется в тестовом моке
    dispatcher: getDispatcher(cfg.insecureTls),
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
