export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type RagChunkForPrompt = { text: string; documentTitle: string; sectionKind: string }

export type SharedExampleForPrompt = { title: string; summary: string }

export const JSON_FORMAT_HINT =
  'Отвечай СТРОГО валидным JSON без дополнительного текста и без markdown-обёрток.'

export const RULE_NO_HALLUCINATIONS =
  'Не выдумывай конкретику: даты, имена, цитаты, статистику, названия. Если нет опоры в [TEACHER_MATERIAL] или [RELEVANT_METHODOLOGY] — подавай гипотетически («представим, что…», «можно обсудить пример из жизни»).'

export const RULE_NO_GRADING = 'Отметки на занятии не выставляются — не предлагай выставлять баллы.'

export function buildMethodologyBlock(chunks: RagChunkForPrompt[]): string {
  if (!chunks.length) return ''
  const lines = chunks.map(
    (c, i) => `[${i + 1}] (${c.documentTitle} · ${c.sectionKind})\n${c.text.slice(0, 800)}`,
  )
  return `\n[RELEVANT_METHODOLOGY]\n${lines.join('\n\n')}\n`
}

export function buildMaterialBlock(text?: string | null): string {
  if (!text) return ''
  return `\n[TEACHER_MATERIAL]\n${text}\n`
}

export function buildGoodExamplesBlock(examples: SharedExampleForPrompt[]): string {
  if (!examples.length) return ''
  const lines = examples.map((e) => `- «${e.title}» — ${e.summary}`)
  return `\n[GOOD_EXAMPLES]\n${lines.join('\n')}\n`
}

export interface PromptDeps {
  chunks: RagChunkForPrompt[]
  examples: SharedExampleForPrompt[]
  userMaterial?: string | null
}
