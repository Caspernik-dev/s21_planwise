export const MAX_FILE_BYTES = 5 * 1024 * 1024

export interface ParseInput {
  buffer: Buffer
  filename: string
  mimeType: string
}

type Kind = 'pdf' | 'docx' | 'txt'

function detectKind(filename: string): Kind {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.txt')) return 'txt'
  throw new Error('Неподдерживаемый формат файла. Разрешены PDF, DOCX, TXT.')
}

function checkMagic(buffer: Buffer, kind: Kind): void {
  if (kind === 'pdf' && buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Файл повреждён или не является PDF.')
  }
  if (kind === 'docx' && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new Error('Файл повреждён или не является DOCX.')
  }
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

  // docx
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ buffer })
  return value.trim()
}
