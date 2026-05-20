import {
  ACTIVITY_TYPE_LABEL,
  type ExportMeta,
  buildScenarioDocument,
} from '@/lib/export/document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const meta: ExportMeta = {
  title: 'Дружба',
  topic: 'О дружбе',
  direction: 'Патриотическое',
  grade: 3,
  durationMin: 40,
  format: 'Беседа',
}

const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы', 'Научиться договариваться'],
  materials: ['Карточки', 'Проектор'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 10,
      activities: [
        { type: 'discussion', text: 'Что такое дружба?', questions: ['А у вас есть друг?'] },
      ],
    },
    {
      kind: 'reflection',
      title: 'Итоги',
      duration_min: 5,
      activities: [{ type: 'task', text: 'Нарисуйте друга' }],
    },
  ],
  adaptations: { simpler: 'Меньше вопросов', harder: 'Эссе' },
}

describe('buildScenarioDocument', () => {
  it('начинается с заголовка названия и таблицы метаданных', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Дружба' })
    const metaBlock = blocks[1]
    expect(metaBlock.type).toBe('metaTable')
    if (metaBlock.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows).toEqual([
      { label: 'Тема', value: 'О дружбе' },
      { label: 'Направление', value: 'Патриотическое' },
      { label: 'Класс', value: '3' },
      { label: 'Длительность', value: '40 мин' },
      { label: 'Формат', value: 'Беседа' },
    ])
  })

  it('выводит цели списком', () => {
    const blocks = buildScenarioDocument(content, meta)
    const idx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Цель')
    expect(idx).toBeGreaterThan(-1)
    expect(blocks[idx + 1]).toEqual({
      type: 'bullets',
      items: ['Понять ценность дружбы', 'Научиться договариваться'],
    })
  })

  it('нумерует обычные этапы с хронометражем и помечает рефлексию', () => {
    const blocks = buildScenarioDocument(content, meta)
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toContain('Этап 1. Вовлечение (10 мин)')
    expect(headings).toContain('Рефлексия (5 мин)')
  })

  it('добавляет к активности метку типа и выводит вопросы списком', () => {
    const blocks = buildScenarioDocument(content, meta)
    const para = blocks.find((b) => b.type === 'paragraph' && b.text.includes('Что такое дружба?'))
    expect(para).toEqual({ type: 'paragraph', text: 'Обсуждение. Что такое дружба?' })
    const q = blocks.find((b) => b.type === 'bullets' && b.items.includes('А у вас есть друг?'))
    expect(q).toBeTruthy()
  })

  it('пропускает раздел материалов, если он пуст', () => {
    const blocks = buildScenarioDocument({ ...content, materials: [] }, meta)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Материалы')).toBe(false)
  })

  it('выводит адаптации двумя абзацами', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Проще: Меньше вопросов' })
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Сложнее: Эссе' })
  })

  it('экспортирует словарь меток типов активностей', () => {
    expect(ACTIVITY_TYPE_LABEL.discussion).toBe('Обсуждение')
    expect(ACTIVITY_TYPE_LABEL.video).toBe('Видео')
  })
})
