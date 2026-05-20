import { scenarioToMarkdown } from '@/lib/scenario/to-markdown'
import { describe, expect, it } from 'vitest'

const content = {
  title: 'Дружба в классе',
  goals: ['сформировать представление о дружбе', 'развить навык договариваться'],
  materials: ['карточки', 'ватман'],
  stages: [
    {
      kind: 'engage' as const,
      title: 'Вовлечение',
      duration_min: 5,
      activities: [
        {
          type: 'discussion' as const,
          text: 'Вспомните, как помог друг.',
          questions: ['Что ты почувствовал?'],
        },
      ],
    },
    {
      kind: 'reflection' as const,
      title: 'Рефлексия',
      duration_min: 5,
      activities: [{ type: 'discussion' as const, text: 'Закончите фразу «друг — это...».' }],
    },
  ],
  adaptations: { simpler: 'упростить вопросы', harder: 'добавить дебаты' },
}

const meta = {
  title: 'Дружба в классе',
  direction: 'Духовно-нравственное',
  gradeRange: '1-2',
  gradeMin: 1,
  gradeMax: 2,
}

describe('scenarioToMarkdown', () => {
  it('emits YAML frontmatter with required keys', () => {
    const md = scenarioToMarkdown(content, meta)
    expect(md).toMatch(/^---\n/)
    expect(md).toContain('title: Дружба в классе')
    expect(md).toContain('direction: Духовно-нравственное')
    expect(md).toContain('grade_range: 1-2')
    expect(md).toContain('grade_min: 1')
    expect(md).toContain('grade_max: 2')
  })

  it('renders Цель / structural stage headings / Рефлексия / Материалы', () => {
    const md = scenarioToMarkdown(content, meta)
    expect(md).toContain('## Цель')
    expect(md).toContain('## Ход занятия. Этап 1. Вовлечение')
    expect(md).toContain('## Рефлексия')
    expect(md).toContain('## Материалы')
  })

  it('includes activity text and questions', () => {
    const md = scenarioToMarkdown(content, meta)
    expect(md).toContain('Вспомните, как помог друг.')
    expect(md).toContain('Что ты почувствовал?')
  })
})
