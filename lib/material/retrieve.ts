import { embed as gigaEmbed } from '@/lib/gigachat/embeddings'
import { chunkMaterial } from './chunk'

export type SelectDeps = {
  embed: (texts: string[]) => Promise<number[][]>
  maxChunks: number
  topK: number
  maxChars: number
}

function defaults(): SelectDeps {
  return {
    embed: gigaEmbed,
    maxChunks: Number(process.env.MATERIAL_MAX_CHUNKS ?? '40'),
    topK: Number(process.env.MATERIAL_TOP_K ?? '5'),
    maxChars: Number(process.env.MATERIAL_MAX_CHARS ?? '6000'),
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Простой тф-подобный скор по стему запроса: сколько токенов чанка начинаются на слово запроса (≥4 симв). */
function keywordScore(chunk: string, query: string): number {
  const qTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
  if (qTokens.length === 0) return 0
  const cLower = chunk.toLowerCase()
  let hits = 0
  for (const qt of qTokens) {
    if (cLower.includes(qt.slice(0, 4))) hits++
  }
  return hits / qTokens.length
}

function capByChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

export async function selectRelevantMaterial(
  text: string,
  query: string,
  deps: Partial<SelectDeps> = {},
): Promise<{ text: string; truncated: boolean }> {
  const d = { ...defaults(), ...deps }
  // Сначала делим по параграфам, затем крупные параграфы дробим chunkMaterial,
  // чтобы каждый смысловой блок оценивался отдельно.
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const allChunks = paras.flatMap((p) => chunkMaterial(p))
  if (allChunks.length === 0) return { text: '', truncated: false }

  const chunks = allChunks.slice(0, d.maxChunks)
  const cappedSource = allChunks.length > d.maxChunks

  let vectors: number[][]
  try {
    vectors = await d.embed([query, ...chunks])
  } catch {
    // материал первичен — не дропаем, отдаём начало текста
    return capByChars(chunks.join('\n\n'), d.maxChars)
  }
  const [qvec, ...cvecs] = vectors
  if (!qvec || cvecs.length !== chunks.length) {
    return capByChars(chunks.join('\n\n'), d.maxChars)
  }

  const ranked = chunks
    .map((c, i) => {
      const cos = cosine(qvec, cvecs[i])
      // Keyword-score как вторичный критерий: помогает при равных cosine
      const kw = keywordScore(c, query)
      return { c, score: cos + 0.01 * kw }
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, d.topK)

  const picked: string[] = []
  let len = 0
  let truncated = cappedSource
  for (const r of ranked) {
    const piece = r.c
    if (len + piece.length > d.maxChars) {
      const remain = d.maxChars - len
      if (remain > 0) picked.push(piece.slice(0, remain))
      truncated = true
      break
    }
    picked.push(piece)
    len += piece.length + 2
  }
  return { text: picked.join('\n\n'), truncated }
}
