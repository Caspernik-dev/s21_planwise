import { renderQrDataUrl } from '@/lib/export/qr'
import { describe, expect, it } from 'vitest'

describe('renderQrDataUrl', () => {
  it('возвращает PNG data URL для ASCII текста', async () => {
    const url = await renderQrDataUrl('https://example.com/')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(200)
  })

  it('кодирует кириллицу в query string', async () => {
    const url = await renderQrDataUrl('https://rutube.ru/search/?query=Дружба')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(200)
  })
})
