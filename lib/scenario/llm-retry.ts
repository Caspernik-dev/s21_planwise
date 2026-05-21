import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

const DEFAULT_CORRECTIVE =
  'Предыдущий ответ невалиден. Верни ТОЛЬКО валидный JSON строго по схеме, без markdown, без пояснений и без текста вокруг.'

// Вызывает chat и парсит ответ; при неудаче повторяет с корректирующим сообщением,
// постепенно снижая температуру, до `attempts` попыток. Возвращает null, если все попытки
// дали невалидный результат. Заменяет «одну repair-попытку» на полноценные ретраи.
export async function generateValidated<T>(
  chat: ChatFn,
  messages: GigaMessage[],
  parse: (raw: string) => T | null,
  opts: { attempts?: number; temperature?: number; corrective?: string } = {},
): Promise<{ value: T; usage: ChatResult['usage']; attempts: number } | null> {
  const maxAttempts = Math.max(1, opts.attempts ?? 3)
  const corrective = opts.corrective ?? DEFAULT_CORRECTIVE
  let convo = messages
  let temperature = opts.temperature ?? 0.4
  let usage: ChatResult['usage'] = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await chat(convo, { temperature })
    usage = res.usage ?? usage
    const value = parse(res.content)
    if (value !== null && value !== undefined) return { value, usage, attempts: attempt }
    convo = [
      ...messages,
      { role: 'assistant', content: res.content },
      { role: 'user', content: corrective },
    ]
    temperature = Math.max(0.1, temperature - 0.15)
  }
  return null
}
