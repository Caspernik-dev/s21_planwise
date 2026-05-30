import { passwordResetTemplate, verifyEmailTemplate } from '@/lib/email/templates'
import { describe, expect, it } from 'vitest'

describe('verifyEmailTemplate', () => {
  const url = 'https://plan-wise.ru/auth/verify?token=ABC'
  const t = verifyEmailTemplate(url)
  it('возвращает subject/html/text', () => {
    expect(t.subject).toMatch(/Planwise/i)
    expect(t.html).toContain(url)
    expect(t.text).toContain(url)
  })
  it('русский subject/тело', () => {
    expect(t.subject).toMatch(/[А-Яа-яЁё]/)
    expect(t.text).toMatch(/[А-Яа-яЁё]/)
  })
})

describe('passwordResetTemplate', () => {
  const url = 'https://plan-wise.ru/reset?token=XYZ'
  const t = passwordResetTemplate(url)
  it('возвращает subject/html/text c URL в обоих вариантах', () => {
    expect(t.html).toContain(url)
    expect(t.text).toContain(url)
  })
  it('текст упоминает срок жизни 1 час', () => {
    expect(t.text).toMatch(/час/i)
  })
})
