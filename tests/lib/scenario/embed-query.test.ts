import { buildEmbedQuery } from '@/lib/scenario/embed-query'
import { describe, expect, it } from 'vitest'

describe('buildEmbedQuery', () => {
  it('rov: содержит direction, grade, topic, format', () => {
    const q = buildEmbedQuery({
      lessonType: 'rov',
      direction: 'Патриотическое',
      grade: 6,
      topic: 'День народного единства',
      format: 'беседа',
    })
    expect(q).toContain('Патриотическое')
    expect(q).toContain('День народного единства')
    expect(q).toContain('6 класс')
    expect(q).toContain('беседа')
  })

  it('subject_extension: содержит subject', () => {
    const q = buildEmbedQuery({
      lessonType: 'subject_extension',
      subject: 'Физика',
      grade: 8,
      topic: 'Сила трения',
      format: 'эксперимент',
    })
    expect(q).toContain('Физика')
    expect(q).toContain('Сила трения')
  })

  it('literacy: содержит лейбл вида грамотности', () => {
    const q = buildEmbedQuery({
      lessonType: 'literacy',
      literacyKind: 'math',
      grade: 7,
      topic: 'Оптимальный маршрут',
      format: 'кейс-сессия',
    })
    expect(q).toContain('Математическая грамотность')
  })

  it('krujok: без direction — только тема/класс/формат', () => {
    const q = buildEmbedQuery({
      lessonType: 'krujok',
      grade: 5,
      topic: 'Робототехника Arduino',
      format: 'мастер-класс',
    })
    expect(q).toContain('Робототехника Arduino')
    expect(q).toContain('мастер-класс')
    expect(q).toContain('5 класс')
  })

  it('СПО (grade=12): корректный лейбл «СПО»', () => {
    const q = buildEmbedQuery({
      lessonType: 'rov',
      direction: 'Трудовое',
      grade: 12,
      topic: 'Профессии будущего',
      format: 'беседа',
    })
    expect(q).toContain('СПО')
  })

  it('event с direction: direction попадает в строку', () => {
    const q = buildEmbedQuery({
      lessonType: 'event',
      direction: 'Эстетическое',
      grade: 4,
      topic: 'Театральная гостиная',
      format: 'праздник',
    })
    expect(q).toContain('Эстетическое')
    expect(q).toContain('Театральная гостиная')
  })
})
