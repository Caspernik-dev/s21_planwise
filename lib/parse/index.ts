export const MAX_FILE_BYTES = 5 * 1024 * 1024

export interface ParseInput {
  buffer: Buffer
  filename: string
  mimeType: string
}

type Kind = 'pdf' | 'docx' | 'pptx' | 'txt'

function detectKind(filename: string): Kind {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pptx')) return 'pptx'
  if (lower.endsWith('.txt')) return 'txt'
  throw new Error('Неподдерживаемый формат файла. Разрешены PDF, DOCX, PPTX, TXT.')
}

function checkMagic(buffer: Buffer, kind: Kind): void {
  if (kind === 'pdf' && buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Файл повреждён или не является PDF.')
  }
  // DOCX и PPTX — OOXML-архивы (ZIP, magic PK).
  if ((kind === 'docx' || kind === 'pptx') && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new Error(
      kind === 'docx'
        ? 'Файл повреждён или не является DOCX.'
        : 'Файл повреждён или не является PPTX.',
    )
  }
}

async function parsePptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (p: string) => Number(p.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return n(a) - n(b)
    })

  const slides: string[] = []
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('string')
    const runs = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []
    const text = runs
      .map((r) => r.replace(/<a:t>([\s\S]*?)<\/a:t>/, '$1'))
      .join(' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (text) slides.push(text)
  }
  return slides.join('\n\n').trim()
}

export async function parseFile({ buffer, filename }: ParseInput): Promise<string> {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('Превышен размер файла (максимум 5 МБ).')
  }
  const kind = detectKind(filename)
  checkMagic(buffer, kind)

  if (kind === 'txt') return new TextDecoder('utf-8').decode(buffer).trim()

  if (kind === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const { text } = await pdfParse(buffer)
    return text.trim()
  }

  if (kind === 'pptx') return parsePptx(buffer)

  // docx
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ buffer })
  return value.trim()
}
