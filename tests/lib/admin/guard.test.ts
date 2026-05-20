import { isAdmin } from '@/lib/admin/guard'
import { describe, expect, it } from 'vitest'

describe('isAdmin', () => {
  it('true для role=admin', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } })).toBe(true)
  })
  it('false для role=user', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c', role: 'user' } })).toBe(false)
  })
  it('false для null-сессии', () => {
    expect(isAdmin(null)).toBe(false)
  })
  it('false если role отсутствует', () => {
    expect(isAdmin({ user: { id: 'u1', email: 'a@b.c' } })).toBe(false)
  })
})
