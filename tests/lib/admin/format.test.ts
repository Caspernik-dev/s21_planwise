import { barPercent, successRate } from '@/lib/admin/format'
import { describe, expect, it } from 'vitest'

describe('barPercent', () => {
  it('доля от максимума в процентах', () => {
    expect(barPercent(5, 10)).toBe(50)
    expect(barPercent(10, 10)).toBe(100)
  })
  it('0 при max=0 (без деления на ноль)', () => {
    expect(barPercent(3, 0)).toBe(0)
  })
  it('клампит в [0,100]', () => {
    expect(barPercent(15, 10)).toBe(100)
    expect(barPercent(-1, 10)).toBe(0)
  })
})

describe('successRate', () => {
  it('процент успешных, округлённый', () => {
    expect(successRate(3, 4)).toBe(75)
  })
  it('0 при total=0', () => {
    expect(successRate(0, 0)).toBe(0)
  })
})
