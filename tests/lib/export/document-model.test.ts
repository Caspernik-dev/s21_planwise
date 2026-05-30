import {
  ACTIVITY_TYPE_LABEL,
  type ExportMeta,
  buildScenarioDocument,
} from '@/lib/export/document-model'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const meta: ExportMeta = {
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
      { label: 'Направление воспитания', value: 'Патриотическое' },
      { label: 'Класс / уровень', value: '3 класс (НОО)' },
      { label: 'Длительность', value: '40 мин' },
      { label: 'Формат', value: 'Беседа' },
      { label: 'Цель занятия', value: 'Понять ценность дружбы (и др.)' },
      { label: 'Оборудование', value: 'Карточки, Проектор' },
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

  it('не дублирует материалы в теле документа (они в шапке metaTable)', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Материалы')).toBe(false)
  })

  it('опускает строку «Оборудование», если materials пуст', () => {
    const blocks = buildScenarioDocument({ ...content, materials: [] }, meta)
    const metaBlock = blocks[1]
    if (metaBlock.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.some((r) => r.label === 'Оборудование')).toBe(false)
  })

  it('выводит основные смыслы, когда они есть; ценности уходят в шапку', () => {
    const blocks = buildScenarioDocument(
      { ...content, values: ['Дружба'], coreMeanings: ['Друзья поддерживают друг друга'] },
      meta,
    )
    const metaBlock = blocks[1]
    if (metaBlock.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.find((r) => r.label === 'Формируемые ценности')?.value).toBe('Дружба')
    const mIdx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Основные смыслы')
    expect(blocks[mIdx + 1]).toEqual({
      type: 'bullets',
      items: ['Друзья поддерживают друг друга'],
    })
  })

  it('пропускает ценности/смыслы, когда их нет', () => {
    const blocks = buildScenarioDocument(content, meta)
    const metaBlock = blocks[1]
    if (metaBlock.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.some((r) => r.label === 'Формируемые ценности')).toBe(false)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Основные смыслы')).toBe(false)
  })

  it('выводит адаптации двумя абзацами', () => {
    const blocks = buildScenarioDocument(content, meta)
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Проще: Меньше вопросов' })
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'Сложнее: Эссе' })
  })

  it('добавляет дисклеймер об ИИ в конец документа', () => {
    const blocks = buildScenarioDocument(content, meta)
    const last = blocks[blocks.length - 1]
    expect(last.type).toBe('paragraph')
    expect('text' in last && last.text).toContain('сгенерирован ИИ')
  })

  it('экспортирует словарь меток типов активностей', () => {
    expect(ACTIVITY_TYPE_LABEL.discussion).toBe('Обсуждение')
    expect(ACTIVITY_TYPE_LABEL.video).toBe('Видео')
    expect(Object.keys(ACTIVITY_TYPE_LABEL).sort()).toEqual([
      'discussion',
      'game',
      'quiz',
      'task',
      'video',
    ])
  })
})

const baseContent: ScenarioContent = {
  title: 'День Победы',
  goals: ['Сформировать уважение к подвигу', 'Развить понимание исторической памяти'],
  values: ['память', 'долг'],
  materials: ['презентация', 'видео'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'x' }],
    },
  ],
  adaptations: { simpler: 's', harder: 'h' },
}

const baseMeta: ExportMeta = {
  topic: 'День Победы',
  direction: 'Патриотическое',
  grade: 6,
  durationMin: 30,
  format: 'беседа',
}

describe('buildScenarioDocument — методическая шапка', () => {
  it('шапка содержит класс с уровнем образования в скобках', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    expect(meta).toBeDefined()
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const audience = meta.rows.find((r) => r.label === 'Класс / уровень')
    expect(audience?.value).toMatch(/ООО/)
    expect(audience?.value).toMatch(/6 класс/)
  })

  it('шапка содержит цель занятия (первую из goals с пометкой и др.)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const goal = meta.rows.find((r) => r.label === 'Цель занятия')
    expect(goal?.value).toContain('Сформировать уважение к подвигу')
    expect(goal?.value).toContain('и др.')
  })

  it('шапка содержит формируемые ценности (если есть)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const values = meta.rows.find((r) => r.label === 'Формируемые ценности')
    expect(values?.value).toBe('память, долг')
  })

  it('шапка содержит оборудование (materials)', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const meta = doc.find((b) => b.type === 'metaTable')
    if (meta?.type !== 'metaTable') throw new Error('not metaTable')
    const eq = meta.rows.find((r) => r.label === 'Оборудование')
    expect(eq?.value).toBe('презентация, видео')
  })
})

describe('buildScenarioDocument — блок личностных результатов', () => {
  it('рендерится, если personalResults непустой', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, personalResults: ['результат А', 'результат Б', 'результат В'] },
      baseMeta,
    )
    const idx = doc.findIndex(
      (b) => b.type === 'heading' && b.text === 'Планируемые личностные результаты',
    )
    expect(idx).toBeGreaterThan(-1)
    const next = doc[idx + 1]
    expect(next.type).toBe('bullets')
    if (next.type === 'bullets') {
      expect(next.items).toEqual(['результат А', 'результат Б', 'результат В'])
    }
  })

  it('не рендерится, если personalResults пустой или отсутствует', () => {
    const doc1 = buildScenarioDocument(baseContent, baseMeta)
    const doc2 = buildScenarioDocument({ ...baseContent, personalResults: [] }, baseMeta)
    for (const doc of [doc1, doc2]) {
      expect(
        doc.some((b) => b.type === 'heading' && b.text === 'Планируемые личностные результаты'),
      ).toBe(false)
    }
  })
})
