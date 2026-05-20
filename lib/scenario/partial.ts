function stripToObject(raw: string): string | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*)/i)
  if (fence) s = fence[1]
  const start = s.indexOf('{')
  if (start === -1) return null
  return s.slice(start)
}

function closeOpenTokens(s: string): string {
  const stack: Array<'{' | '['> = []
  let inString = false
  let escaped = false
  for (const c of s) {
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }
  let out = s
  if (inString) out += '"'
  out = out.replace(/\s+$/, '')
  if (out.endsWith(',')) out = out.slice(0, -1)
  if (out.endsWith(':')) out += 'null'
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']'
  }
  return out
}

// Парсит возможно-обрезанный JSON-префикс объекта, дополняя открытые
// строки/массивы/объекты. Возвращает значение или null.
export function parsePartialJson(raw: string): unknown | null {
  const s = stripToObject(raw)
  if (s === null) return null
  try {
    return JSON.parse(s)
  } catch {
    try {
      return JSON.parse(closeOpenTokens(s))
    } catch {
      return null
    }
  }
}
