import { MAX_FILE_BYTES, parseFile } from '@/lib/parse'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdf-parse', () => ({ default: vi.fn(async () => ({ text: 'PDF текст' })) }))
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'DOCX текст' })) },
}))

const txt = (s: string) => new TextEncoder().encode(s)

describe('parseFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('читает TXT через TextDecoder', async () => {
    const out = await parseFile({
      buffer: Buffer.from(txt('Привет план')),
      filename: 'p.txt',
      mimeType: 'text/plain',
    })
    expect(out).toBe('Привет план')
  })

  it('читает PDF (magic %PDF) через pdf-parse', async () => {
    const buf = Buffer.from('%PDF-1.4 ...binary...')
    const out = await parseFile({ buffer: buf, filename: 'p.pdf', mimeType: 'application/pdf' })
    expect(out).toBe('PDF текст')
  })

  it('читает DOCX (magic PK) через mammoth', async () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    const out = await parseFile({
      buffer: buf,
      filename: 'p.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(out).toBe('DOCX текст')
  })

  it('отклоняет неподдерживаемое расширение', async () => {
    await expect(
      parseFile({
        buffer: Buffer.from('x'),
        filename: 'p.exe',
        mimeType: 'application/octet-stream',
      }),
    ).rejects.toThrow(/формат/i)
  })

  it('отклоняет файл больше лимита', async () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1)
    await expect(
      parseFile({ buffer: big, filename: 'p.txt', mimeType: 'text/plain' }),
    ).rejects.toThrow(/размер|5 ?МБ|МБ/i)
  })

  it('отклоняет PDF с неверными magic bytes', async () => {
    await expect(
      parseFile({ buffer: Buffer.from('NOTPDF'), filename: 'p.pdf', mimeType: 'application/pdf' }),
    ).rejects.toThrow(/повреж|формат/i)
  })
})
