import {
  buildSearchUrl,
  extractOrFallbackQuery,
  fallbackSearchQuery,
  sanitizeRutubeText,
} from '@/lib/scenario/rutube'
import { describe, expect, it } from 'vitest'

describe('sanitizeRutubeText', () => {
  it('заменяет прямую ссылку на ролик RuTube на маркер', () => {
    const input = 'Включаем https://rutube.ru/video/abc123/ и обсуждаем.'
    expect(sanitizeRutubeText(input)).toBe('Включаем [Просмотр ролика] и обсуждаем.')
  })

  it('заменяет ссылку YouTube watch-формата', () => {
    const input = 'Смотрим https://www.youtube.com/watch?v=dQw4w9WgXcQ дружно.'
    expect(sanitizeRutubeText(input)).toBe('Смотрим [Просмотр ролика] дружно.')
  })

  it('заменяет ссылку youtu.be', () => {
    const input = 'Ссылка https://youtu.be/abc123 покажет.'
    expect(sanitizeRutubeText(input)).toBe('Ссылка [Просмотр ролика] покажет.')
  })

  it('не трогает search-ссылку на RuTube', () => {
    const input = 'Откройте https://rutube.ru/search/?query=Дружба и ищите.'
    expect(sanitizeRutubeText(input)).toBe(input)
  })

  it('идемпотентна на тексте без ссылок', () => {
    expect(sanitizeRutubeText('Учитель: давайте обсудим.')).toBe('Учитель: давайте обсудим.')
  })
})

describe('buildSearchUrl', () => {
  it('собирает URL с URL-encoded query', () => {
    expect(buildSearchUrl('Дружба школьники')).toBe(
      'https://rutube.ru/search/?query=%D0%94%D1%80%D1%83%D0%B6%D0%B1%D0%B0%20%D1%88%D0%BA%D0%BE%D0%BB%D1%8C%D0%BD%D0%B8%D0%BA%D0%B8',
    )
  })

  it('тримит пробелы', () => {
    expect(buildSearchUrl('  Семья  ')).toBe(
      'https://rutube.ru/search/?query=%D0%A1%D0%B5%D0%BC%D1%8C%D1%8F',
    )
  })
})

describe('fallbackSearchQuery', () => {
  it('склеивает тему + направление + ведущую ценность', () => {
    expect(fallbackSearchQuery('День народного единства', 'Патриотическое', 'патриотизм')).toBe(
      'День народного единства Патриотическое патриотизм',
    )
  })

  it('пропускает undefined компоненты', () => {
    expect(fallbackSearchQuery('Дружба', undefined, undefined)).toBe('Дружба')
  })

  it('обрезает до 80 символов по последнему пробелу', () => {
    const q = fallbackSearchQuery(
      'Очень длинная и подробная тема о всём сразу для проверки лимита длины запроса',
      'Духовно-нравственное',
      'высокие нравственные идеалы',
    )
    expect(q.length).toBeLessThanOrEqual(80)
    expect(q.endsWith(' ')).toBe(false)
  })
})

describe('extractOrFallbackQuery', () => {
  it('берёт валидный videoSearchQuery как есть', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: 'Дружба мультфильм', text: '...' },
        { topic: 'Дружба', direction: 'Духовно-нравственное', leadingValue: undefined },
      ),
    ).toBe('Дружба мультфильм')
  })

  it('игнорирует videoSearchQuery если это URL и идёт в fallback', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: 'https://rutube.ru/video/x/', text: '...' },
        { topic: 'Дружба', direction: undefined, leadingValue: undefined },
      ),
    ).toBe('Дружба')
  })

  it('возвращает fallback при пустом query', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'video', videoSearchQuery: '   ', text: '...' },
        { topic: 'Семья', direction: undefined, leadingValue: undefined },
      ),
    ).toBe('Семья')
  })

  it('возвращает undefined для non-video активности', () => {
    expect(
      extractOrFallbackQuery(
        { type: 'discussion', text: '...' },
        { topic: 'X', direction: undefined, leadingValue: undefined },
      ),
    ).toBeUndefined()
  })
})
