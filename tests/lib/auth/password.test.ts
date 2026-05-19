import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('password', () => {
  it('hashPassword returns a bcrypt hash distinct from input', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })

  it('verifyPassword returns true for matching password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('s3cret!', hash)).toBe(true)
  })

  it('verifyPassword returns false for non-matching password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('verifyPassword returns false for malformed hash', async () => {
    expect(await verifyPassword('anything', 'not-a-bcrypt-hash')).toBe(false)
  })
})
