import { isSameOrigin } from '@/lib/auth/origin'
import { describe, expect, it } from 'vitest'

describe('isSameOrigin', () => {
  it('пропускает совпадающие origin и host', () => {
    expect(isSameOrigin('https://kc.example.com', 'kc.example.com')).toBe(true)
  })
  it('пропускает http origin с тем же host', () => {
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true)
  })
  it('блокирует чужой origin', () => {
    expect(isSameOrigin('https://evil.com', 'kc.example.com')).toBe(false)
  })
  it('блокирует, если origin отсутствует', () => {
    expect(isSameOrigin(null, 'kc.example.com')).toBe(false)
  })
  it('блокирует, если host отсутствует', () => {
    expect(isSameOrigin('https://kc.example.com', null)).toBe(false)
  })
  it('блокирует битый origin', () => {
    expect(isSameOrigin('not-a-url', 'kc.example.com')).toBe(false)
  })
})
