import { prepareMaterial } from '@/lib/material/prepare'
import { describe, expect, it } from 'vitest'

describe('prepareMaterial', () => {
  it('обезличивает по умолчанию (consent=false)', () => {
    const r = prepareMaterial('Позвоните Ивану по 8-900-123-45-67.', false)
    expect(r.anonymized).toBe(true)
    expect(r.text).not.toContain('8-900-123-45-67')
    expect(r.piiCount).toBeGreaterThan(0)
  })

  it('при consent=true отдаёт сырой текст', () => {
    const raw = 'Позвоните Ивану по 8-900-123-45-67.'
    const r = prepareMaterial(raw, true)
    expect(r.anonymized).toBe(false)
    expect(r.text).toBe(raw)
  })
})
