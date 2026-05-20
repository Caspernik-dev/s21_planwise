import { anonymizeContent, strictPiiCheck } from '@/lib/community/pii-gate'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

function content(overrides: Partial<ScenarioContent> = {}): ScenarioContent {
  return {
    title: 'Тема',
    goals: ['Развивать'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Старт',
        duration_min: 10,
        activities: [{ type: 'discussion', text: 'Обсуждение' }],
      },
    ],
    adaptations: { simpler: 'a', harder: 'b' },
    ...overrides,
  }
}

describe('anonymizeContent', () => {
  it('replaces phone and email in nested fields with placeholders', () => {
    const c = content({
      stages: [
        {
          kind: 'engage',
          title: 'Звоните +7 999 123-45-67',
          duration_min: 10,
          activities: [{ type: 'discussion', text: 'Почта ivan@mail.ru' }],
        },
      ],
    })
    const out = anonymizeContent(c)
    expect(out.stages[0].title).not.toContain('+7 999 123-45-67')
    expect(out.stages[0].activities[0].text).not.toContain('ivan@mail.ru')
  })
})

describe('strictPiiCheck', () => {
  it('passes clean content', () => {
    const res = strictPiiCheck(content())
    expect(res.clean).toBe(true)
    if (res.clean) expect(res.anonymized).toBeDefined()
  })

  it('cleans contact PII so result is shareable', () => {
    const c = content({ goals: ['Позвонить ivan@mail.ru'] })
    const res = strictPiiCheck(c)
    expect(res.clean).toBe(true)
    if (res.clean) expect(JSON.stringify(res.anonymized)).not.toContain('ivan@mail.ru')
  })
})
