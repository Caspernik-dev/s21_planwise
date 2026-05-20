import { buildMessages } from '@/lib/scenario/prompt'
import type { GenerationInput } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const input: GenerationInput = {
  direction: 'Гражданское',
  grade: 5,
  topic: 'дружба',
  durationMin: 30,
  format: 'беседа',
}

describe('buildMessages GOOD_EXAMPLES', () => {
  it('renders shared examples block when provided', () => {
    const msgs = buildMessages(
      input,
      [],
      [{ title: 'Пример', summary: 'Этапы: вступление, основа, рефлексия' }],
    )
    const user = msgs.find((m) => m.role === 'user')
    expect(user?.content).toContain('GOOD_EXAMPLES')
    expect(user?.content).toContain('Пример')
  })
  it('omits block when no examples', () => {
    const msgs = buildMessages(input, [])
    const user = msgs.find((m) => m.role === 'user')
    expect(user?.content).not.toContain('GOOD_EXAMPLES')
  })
})
