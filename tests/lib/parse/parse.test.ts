import { MAX_FILE_BYTES, parseFile } from '@/lib/parse'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdf-parse', () => ({ default: vi.fn(async () => ({ text: 'PDF текст' })) }))
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'DOCX текст' })) },
}))

// Мок JSZip: архив со слайдами в перемешанном порядке —
// проверяем числовую сортировку slide1/slide2/slide10 и извлечение <a:t>.
const pptxFiles: Record<string, string> = {
  'ppt/slides/slide10.xml': '<a:t>Слайд десять</a:t>',
  'ppt/slides/slide2.xml': '<a:t>Второй</a:t><a:t>слайд</a:t>',
  'ppt/slides/slide1.xml': '<a:t>Дружба &amp; класс</a:t>',
  'ppt/presentation.xml': '<a:t>не слайд</a:t>',
}
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn(async () => ({
      files: Object.fromEntries(
        Object.entries(pptxFiles).map(([path, xml]) => [path, { async: async () => xml }]),
      ),
    })),
  },
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

  it('читает PPTX (magic PK): слайды по порядку, текст из <a:t>, без не-слайдов, разэкранирование', async () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    const out = await parseFile({
      buffer: buf,
      filename: 'p.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    expect(out).toBe('Дружба & класс\n\nВторой слайд\n\nСлайд десять')
  })

  it('отклоняет PPTX с неверными magic bytes', async () => {
    await expect(
      parseFile({ buffer: Buffer.from('NOTPPTX'), filename: 'p.pptx', mimeType: 'application/x' }),
    ).rejects.toThrow(/повреж|PPTX/i)
  })
})
