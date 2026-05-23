// Катящаяся сводка уже сгенерированных блоков — прокидывается в следующий per-block
// вызов, чтобы модель не повторялась и связывала ход занятия. Строится программно,
// без обращения к LLM.

export type GeneratedBlock = {
  stageTitle: string
  type: string
  text: string
}

const SNIPPET_CHARS = 200

export function buildRunningContext(blocks: GeneratedBlock[]): string {
  if (blocks.length === 0) return ''
  const lines = blocks.map((b) => {
    const snippet = b.text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS)
    return `— Этап «${b.stageTitle}» (${b.type}): ${snippet}…`
  })
  return [
    'Уже раскрыто в предыдущих блоках (НЕ повторяй их содержание — опирайся и развивай дальше):',
    ...lines,
  ].join('\n')
}
