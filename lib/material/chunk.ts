const MAX_TOKENS = 800
const MAX_CHARS = MAX_TOKENS * 3 // эвристика chars/3 (локальный токенайзер запрещён)

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

export function chunkMaterial(text: string): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p
    if (estimateTokens(candidate) > MAX_TOKENS && buf) {
      out.push(buf)
      buf = p
    } else {
      buf = candidate
    }
    while (estimateTokens(buf) > MAX_TOKENS) {
      out.push(buf.slice(0, MAX_CHARS))
      buf = buf.slice(MAX_CHARS)
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}
