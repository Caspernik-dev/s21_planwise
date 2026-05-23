import { type GeneratedBlock, buildRunningContext } from '@/lib/scenario/context'
import { describe, expect, it } from 'vitest'

describe('buildRunningContext', () => {
  it('для пустого списка возвращает пустую строку', () => {
    expect(buildRunningContext([])).toBe('')
  })

  it('включает заголовок этапа, тип и срез текста', () => {
    const blocks: GeneratedBlock[] = [
      { stageTitle: 'Старт', type: 'discussion', text: 'Учитель: Здравствуйте, ребята.' },
    ]
    const ctx = buildRunningContext(blocks)
    expect(ctx).toContain('Старт')
    expect(ctx).toContain('discussion')
    expect(ctx).toContain('Здравствуйте')
  })

  it('обрезает длинный текст до ~200 символов и схлопывает пробелы', () => {
    const long = `${'а'.repeat(500)}`
    const ctx = buildRunningContext([{ stageTitle: 'M', type: 'task', text: long }])
    expect(ctx.length).toBeLessThan(350)
  })
})
