import type { Direction } from '@/lib/scenario/options'
import { VALUES_809, selectValues } from '@/lib/scenario/values-809'
import { describe, expect, it } from 'vitest'

describe('VALUES_809', () => {
  it('содержит ровно 17 ценностей', () => {
    expect(VALUES_809).toHaveLength(17)
  })

  it('первая ценность — «жизнь»', () => {
    expect(VALUES_809[0]).toBe('жизнь')
  })

  it('последняя ценность — «единство народов России»', () => {
    expect(VALUES_809[16]).toBe('единство народов России')
  })

  it('все ценности уникальны', () => {
    expect(new Set(VALUES_809).size).toBe(17)
  })
})

describe('selectValues — leadingValue', () => {
  it('валидный leadingValue из 17 → используется как есть', () => {
    const result = selectValues(
      { leadingValue: 'патриотизм', secondaryValues: [], valueFormulations: [] },
      'Патриотическое',
    )
    expect(result.leadingValue).toBe('патриотизм')
  })

  it('отсутствующий/null leadingValue + валидное направление → fallback из маппинга', () => {
    const result = selectValues(
      { leadingValue: null, secondaryValues: [], valueFormulations: [] },
      'Патриотическое',
    )
    expect(result.leadingValue).toBe('патриотизм')
  })

  it('невалидная строка leadingValue (не в 17) + направление → fallback из маппинга', () => {
    const result = selectValues(
      { leadingValue: 'свобода', secondaryValues: [], valueFormulations: [] },
      'Гражданское',
    )
    expect(result.leadingValue).toBe('гражданственность')
  })

  it('нет leadingValue и нет направления → fallback на первую из 17 («жизнь»)', () => {
    const result = selectValues({ leadingValue: undefined }, undefined)
    expect(result.leadingValue).toBe('жизнь')
  })

  it('все 12 направлений маппятся без ошибок', () => {
    const directions: Direction[] = [
      'Гражданское',
      'Патриотическое',
      'Духовно-нравственное',
      'Эстетическое',
      'Физическое и здоровье',
      'Трудовое',
      'Экологическое',
      'Познавательное',
      'Адаптация к изменяющимся условиям',
      'Семейные ценности',
      'Профориентация',
      'Здоровый образ жизни',
    ]
    for (const dir of directions) {
      const result = selectValues({ leadingValue: undefined }, dir)
      expect(VALUES_809).toContain(result.leadingValue)
    }
  })
})

describe('selectValues — secondaryValues', () => {
  it('валидные secondaryValues проходят через whitelist', () => {
    const result = selectValues(
      {
        leadingValue: 'патриотизм',
        secondaryValues: ['гражданственность', 'созидательный труд'],
        valueFormulations: [],
      },
      'Патриотическое',
    )
    expect(result.secondaryValues).toEqual(['гражданственность', 'созидательный труд'])
  })

  it('leadingValue исключается из secondaryValues', () => {
    const result = selectValues(
      {
        leadingValue: 'патриотизм',
        secondaryValues: ['патриотизм', 'гражданственность'],
        valueFormulations: [],
      },
      'Патриотическое',
    )
    expect(result.secondaryValues).not.toContain('патриотизм')
    expect(result.secondaryValues).toContain('гражданственность')
  })

  it('secondaryValues дедуплицируются', () => {
    const result = selectValues(
      {
        leadingValue: 'жизнь',
        secondaryValues: ['патриотизм', 'патриотизм', 'гражданственность'],
        valueFormulations: [],
      },
      'Физическое и здоровье',
    )
    expect(result.secondaryValues.filter((v) => v === 'патриотизм').length).toBe(1)
  })

  it('secondaryValues > 3 → обрезаются до 3', () => {
    const result = selectValues(
      {
        leadingValue: 'жизнь',
        secondaryValues: [
          'патриотизм',
          'гражданственность',
          'созидательный труд',
          'гуманизм',
          'справедливость',
        ],
        valueFormulations: [],
      },
      'Физическое и здоровье',
    )
    expect(result.secondaryValues.length).toBeLessThanOrEqual(3)
  })

  it('невалидные строки в secondaryValues фильтруются', () => {
    const result = selectValues(
      {
        leadingValue: 'жизнь',
        secondaryValues: ['патриотизм', 'несуществующая ценность', 'гуманизм'],
        valueFormulations: [],
      },
      'Физическое и здоровье',
    )
    expect(result.secondaryValues).not.toContain('несуществующая ценность')
    expect(result.secondaryValues).toContain('патриотизм')
    expect(result.secondaryValues).toContain('гуманизм')
  })

  it('undefined secondaryValues → пустой массив', () => {
    const result = selectValues({ leadingValue: 'жизнь' }, 'Физическое и здоровье')
    expect(result.secondaryValues).toEqual([])
  })
})

describe('selectValues — valueFormulations', () => {
  it('валидные formulations проходят через', () => {
    const formulations = [
      { text: 'Любовь к Родине — основа гражданства', basedOn: 'патриотизм' as const },
    ]
    const result = selectValues(
      { leadingValue: 'патриотизм', valueFormulations: formulations },
      'Патриотическое',
    )
    expect(result.valueFormulations).toEqual(formulations)
  })

  it('formulation с невалидным basedOn → фильтруется', () => {
    const formulations = [
      { text: 'Хорошая фраза', basedOn: 'несуществующая ценность' },
      { text: 'Другая фраза', basedOn: 'патриотизм' },
    ]
    const result = selectValues(
      { leadingValue: 'патриотизм', valueFormulations: formulations },
      'Патриотическое',
    )
    expect(result.valueFormulations).toHaveLength(1)
    expect(result.valueFormulations[0].basedOn).toBe('патриотизм')
  })

  it('не-объектный элемент в valueFormulations → фильтруется', () => {
    const formulations = ['строка', null, { text: 'Нормальная фраза', basedOn: 'жизнь' }]
    const result = selectValues(
      { leadingValue: 'жизнь', valueFormulations: formulations },
      'Физическое и здоровье',
    )
    expect(result.valueFormulations).toHaveLength(1)
  })

  it('formulation с пустым text → фильтруется', () => {
    const formulations = [
      { text: '', basedOn: 'жизнь' },
      { text: '   ', basedOn: 'патриотизм' },
      { text: 'Нормальный текст', basedOn: 'гуманизм' },
    ]
    const result = selectValues(
      { leadingValue: 'жизнь', valueFormulations: formulations },
      'Физическое и здоровье',
    )
    expect(result.valueFormulations).toHaveLength(1)
    expect(result.valueFormulations[0].text).toBe('Нормальный текст')
  })

  it('valueFormulations > 8 → обрезаются до 8', () => {
    const formulations = Array.from({ length: 10 }, (_, i) => ({
      text: `Фраза ${i + 1}`,
      basedOn: 'жизнь' as const,
    }))
    const result = selectValues(
      { leadingValue: 'жизнь', valueFormulations: formulations },
      'Физическое и здоровье',
    )
    expect(result.valueFormulations.length).toBeLessThanOrEqual(8)
  })

  it('undefined valueFormulations → пустой массив', () => {
    const result = selectValues({ leadingValue: 'жизнь' }, 'Физическое и здоровье')
    expect(result.valueFormulations).toEqual([])
  })
})
