import { detectPatterns } from '@/lib/pii/patterns'
import { describe, expect, it } from 'vitest'

const types = (text: string) => detectPatterns(text).map((m) => m.type)

describe('detectPatterns', () => {
  it('детектит телефоны в разных форматах', () => {
    expect(types('звоните +7 (912) 345-67-89')).toContain('phone')
    expect(types('тел 89123456789')).toContain('phone')
    expect(types('8-912-345-67-89')).toContain('phone')
  })

  it('детектит email', () => {
    const matches = detectPatterns('пишите на ivan.petrov@school42.ru пожалуйста')
    expect(matches.find((x) => x.type === 'email')?.value).toBe('ivan.petrov@school42.ru')
  })

  it('детектит email внутри markdown-ссылки', () => {
    const matches = detectPatterns(
      'пишите на [ivan.petrov@school42.ru](mailto:ivan.petrov@school42.ru)',
    )
    expect(matches.some((x) => x.type === 'email')).toBe(true)
  })

  it('детектит СНИЛС без проверки контрольной суммы', () => {
    expect(types('СНИЛС 112-233-445 95')).toContain('snils')
    expect(types('112-233-445-95')).toContain('snils')
  })

  it('детектит паспорт только в контексте слова «паспорт»', () => {
    expect(types('паспорт 4509 123456')).toContain('passport')
    expect(types('кабинет 4509 123456')).not.toContain('passport')
  })

  it('детектит ИНН (10 и 12 цифр) без контрольной суммы', () => {
    expect(types('ИНН 7707083893')).toContain('inn')
    expect(types('ИНН 500100732259')).toContain('inn')
  })

  it('не детектит ИНН без контекста', () => {
    expect(types('номер кабинета 7707083893')).not.toContain('inn')
    expect(types('идентификатор 500100732259')).not.toContain('inn')
  })

  it('детектит дату рождения только в контексте', () => {
    expect(types('д.р. 12.05.2011')).toContain('dob')
    expect(types('дата рождения: 12.05.2011')).toContain('dob')
    expect(types('родился 12.05.2011')).toContain('dob')
    expect(types('занятие 12.05.2011 в актовом зале')).not.toContain('dob')
  })

  it('детектит адрес по ключевым словам', () => {
    expect(types('проживает по адресу ул. Ленина, д. 5, кв. 12')).toContain('address')
    expect(types('проспект Мира, д. 12')).toContain('address')
    expect(types('адрес: пер. Садовый, д. 7')).toContain('address')
    expect(types('улица Гагарина, д. 3')).toContain('address')
  })

  it('не даёт ложных адресов внутри обычных слов', () => {
    expect(types('регулярное общение и аккумулятор знаний')).not.toContain('address')
    expect(types('оперативный разбор и первый шаг')).not.toContain('address')
    expect(types('формирование взаимопонимания, переход к практике')).not.toContain('address')
    expect(types('улыбка и улей на занятии')).not.toContain('address')
  })

  it('возвращает корректные start/end (срез текста равен value)', () => {
    const text = 'почта foo@bar.ru конец'
    // biome-ignore lint/style/noNonNullAssertion: email guaranteed present in this fixture
    const m = detectPatterns(text).find((x) => x.type === 'email')!
    expect(text.slice(m.start, m.end)).toBe(m.value)
  })
})