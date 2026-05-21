import { coerceActivityType, coerceContentTypes } from '@/lib/scenario/coerce'
import { describe, expect, it } from 'vitest'

describe('coerceActivityType', () => {
  it('оставляет валидные типы как есть', () => {
    for (const t of ['discussion', 'quiz', 'game', 'task', 'video']) {
      expect(coerceActivityType(t)).toBe(t)
    }
  })

  it('маппит частые «выдуманные» типы GigaChat', () => {
    expect(coerceActivityType('presentation')).toBe('video')
    expect(coerceActivityType('group_work')).toBe('task')
    expect(coerceActivityType('практическое')).toBe('task')
    expect(coerceActivityType('беседа')).toBe('discussion')
  })

  it('неизвестное / не строку → discussion', () => {
    expect(coerceActivityType('что-то новое')).toBe('discussion')
    expect(coerceActivityType(undefined)).toBe('discussion')
    expect(coerceActivityType(42)).toBe('discussion')
  })

  it('регистр и пробелы не важны', () => {
    expect(coerceActivityType('  Presentation ')).toBe('video')
  })
})

describe('coerceContentTypes', () => {
  it('нормализует типы во всех активностях всех этапов', () => {
    const obj = {
      title: 'x',
      stages: [
        { activities: [{ type: 'presentation' }, { type: 'discussion' }] },
        { activities: [{ type: 'group_work' }] },
      ],
    }
    coerceContentTypes(obj)
    expect(obj.stages[0].activities[0].type).toBe('video')
    expect(obj.stages[0].activities[1].type).toBe('discussion')
    expect(obj.stages[1].activities[0].type).toBe('task')
  })

  it('не падает на отсутствующих stages/activities', () => {
    expect(() => coerceContentTypes({})).not.toThrow()
    expect(() => coerceContentTypes({ stages: [{}] })).not.toThrow()
  })
})
