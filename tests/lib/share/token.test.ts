import { generateShareToken } from '@/lib/share/token'
import { describe, expect, it } from 'vitest'

describe('generateShareToken', () => {
  it('возвращает url-safe строку достаточной длины', () => {
    const t = generateShareToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/) // base64url-алфавит, без +/=
    expect(t.length).toBeGreaterThanOrEqual(22) // ~24 байта → ≥128 бит
  })

  it('генерирует разные токены', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateShareToken()))
    expect(set.size).toBe(100)
  })
})
