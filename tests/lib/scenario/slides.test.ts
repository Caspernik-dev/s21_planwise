import type { ScenarioContent } from '@/lib/scenario/schema'
import { buildSlides } from '@/lib/scenario/slides'
import { describe, expect, it } from 'vitest'

const meta = {
  direction: 'Патриотическое',
  grade: 6,
  durationMin: 30,
  format: 'беседа',
}

const content: ScenarioContent = {
  title: 'Дружба и взаимовыручка',
  goals: ['Цель'],
  materials: ['Проектор'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 5,
      activities: [
        {
          type: 'discussion',
          text: 'Учитель: о чём поговорим?',
          questions: ['Что такое дружба?', 'Кто твой друг?'],
        },
      ],
    },
    {
      kind: 'main',
      title: 'Основная часть',
      duration_min: 20,
      activities: [{ type: 'game', text: 'Поиграем в командную игру.' }],
    },
  ],
  adaptations: { simpler: 'проще', harder: 'сложнее' },
}

describe('buildSlides', () => {
  it('первый слайд — титульный с названием и бейджами', () => {
    const slides = buildSlides(content, meta)
    const first = slides[0]
    expect(first.kind).toBe('title')
    if (first.kind === 'title') {
      expect(first.title).toBe('Дружба и взаимовыручка')
      expect(first.badges).toContain('Патриотическое')
      expect(first.badges).toContain('6 класс')
      expect(first.badges).toContain('30 мин')
      expect(first.badges).toContain('беседа')
    }
  })

  it('по одному слайду на каждый этап после титульного', () => {
    const slides = buildSlides(content, meta)
    expect(slides).toHaveLength(3)
    expect(slides[1].kind).toBe('stage')
    expect(slides[2].kind).toBe('stage')
  })

  it('слайд этапа несёт заголовок и хронометраж', () => {
    const slides = buildSlides(content, meta)
    const stage = slides[1]
    if (stage.kind === 'stage') {
      expect(stage.title).toBe('Вовлечение')
      expect(stage.durationMin).toBe(5)
    }
  })

  it('активность с вопросами → буллеты вопросов, без текста', () => {
    const slides = buildSlides(content, meta)
    const stage = slides[1]
    if (stage.kind === 'stage') {
      const block = stage.blocks[0]
      expect(block.typeLabel).toBe('Беседа / обсуждение')
      expect(block.questions).toEqual(['Что такое дружба?', 'Кто твой друг?'])
      expect(block.text).toBeUndefined()
    }
  })

  it('активность без вопросов → текст активности', () => {
    const slides = buildSlides(content, meta)
    const stage = slides[2]
    if (stage.kind === 'stage') {
      const block = stage.blocks[0]
      expect(block.typeLabel).toBe('Игра')
      expect(block.text).toBe('Поиграем в командную игру.')
      expect(block.questions).toBeUndefined()
    }
  })
})
