import { PROMPT_VERSION, buildMessages } from '@/lib/scenario/prompt'
import { describe, expect, it } from 'vitest'

const input = {
  direction: 'Патриотическое' as const,
  grade: 6,
  topic: 'День Победы',
  durationMin: 30,
  format: 'классный час' as const,
}

describe('buildMessages', () => {
  it('returns a system and a user message', () => {
    const msgs = buildMessages(input)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
  })

  it('system message forbids real children names and demands JSON', () => {
    const sys = buildMessages(input)[0].content
    expect(sys.toLowerCase()).toContain('json')
    expect(sys).toContain('имён')
  })

  it('user message embeds all context fields', () => {
    const user = buildMessages(input)[1].content
    expect(user).toContain('Патриотическое')
    expect(user).toContain('6')
    expect(user).toContain('День Победы')
    expect(user).toContain('30')
    expect(user).toContain('классный час')
  })

  it('exposes a stable prompt version string', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION.length).toBeGreaterThan(0)
  })
})
