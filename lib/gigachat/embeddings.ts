import { getGigaConfig } from './config'
import { withGigaChatSlot } from './concurrency'
import { ensureInsecureTls } from './tls'
import { getAccessToken } from './token'
import type { EmbeddingsResponse } from './types'

function batchSize(): number {
  const n = Number(process.env.RAG_EMBED_BATCH ?? '32')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 32
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const cfg = getGigaConfig()
  ensureInsecureTls(cfg.insecureTls)
  const token = await getAccessToken()

  const res = await fetch(`${cfg.apiBase}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ model: cfg.embedModel, input: texts }),
  })

  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`GigaChat embeddings failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as EmbeddingsResponse
  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

export async function embed(
  texts: string[],
  opts: { onQueued?: (position: number) => void; signal?: AbortSignal } = {},
): Promise<number[][]> {
  if (texts.length === 0) return []
  const size = batchSize()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size)
    const res = await withGigaChatSlot(() => embedBatch(batch), opts)
    out.push(...res)
  }
  return out
}
