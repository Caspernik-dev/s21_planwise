export type GigaMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionRequest = {
  model: string
  messages: GigaMessage[]
  temperature?: number
  max_tokens?: number
  stream?: false
}

export type ChatCompletionResponse = {
  choices: Array<{
    message: { role: string; content: string }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export type OAuthResponse = {
  access_token: string
  expires_at: number // unix epoch в миллисекундах
}

export type ChatResult = {
  content: string
  usage: { promptTokens: number; completionTokens: number } | null
}

export type EmbeddingsResponse = {
  data: Array<{ embedding: number[]; index: number }>
  model?: string
}
