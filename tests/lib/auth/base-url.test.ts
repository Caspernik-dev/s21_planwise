import { baseUrlFrom } from '@/lib/auth/base-url'
import { describe, expect, it } from 'vitest'

describe('baseUrlFrom', () => {
  it('строит https из x-forwarded-proto + host', () => {
    expect(baseUrlFrom('kc.example.com', 'https')).toBe('https://kc.example.com')
  })
  it('дефолтит на http при отсутствии proto', () => {
    expect(baseUrlFrom('localhost:3000', null)).toBe('http://localhost:3000')
  })
  it('падает на env AUTH_URL при отсутствии host', () => {
    expect(baseUrlFrom(null, null, 'https://fallback.example.com')).toBe(
      'https://fallback.example.com',
    )
  })
  it('падает на localhost при отсутствии host и env', () => {
    expect(baseUrlFrom(null, null, undefined)).toBe('http://localhost:3000')
  })
})
