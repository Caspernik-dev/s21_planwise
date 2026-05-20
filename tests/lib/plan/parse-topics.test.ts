import { parsePlanTopics } from '@/lib/plan/parse-topics'
import { describe, expect, it } from 'vitest'

describe('parsePlanTopics', () => {
  it('извлекает темы из нумерованного списка', () => {
    const text = `План воспитательной работы
1. День знаний
2. Дружба и взаимопомощь
3. Безопасность в интернете`
    const t = parsePlanTopics(text)
    expect(t.map((x) => x.title)).toEqual([
      'День знаний',
      'Дружба и взаимопомощь',
      'Безопасность в интернете',
    ])
  })

  it('извлекает дату, если она есть в строке', () => {
    const t = parsePlanTopics('01.09 — День знаний\n15.09 — Моя семья')
    expect(t[0]).toMatchObject({ title: 'День знаний', plannedDate: '01.09' })
    expect(t[1].title).toBe('Моя семья')
  })

  it('поддерживает маркированные списки', () => {
    const t = parsePlanTopics('- Тема про экологию\n• Тема про труд')
    expect(t.map((x) => x.title)).toEqual(['Тема про экологию', 'Тема про труд'])
  })

  it('игнорирует заголовки и слишком короткие строки', () => {
    const t = parsePlanTopics('ПЛАН\n\nок\n1. Настоящая тема занятия')
    expect(t.map((x) => x.title)).toEqual(['Настоящая тема занятия'])
  })

  it('возвращает порядковый orderIdx', () => {
    const t = parsePlanTopics('1. Альфа\n2. Бета')
    expect(t.map((x) => x.orderIdx)).toEqual([0, 1])
  })
})
