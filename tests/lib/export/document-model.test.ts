import {
  ACTIVITY_TYPE_LABEL,
  type ExportMeta,
  buildScenarioDocument,
} from '@/lib/export/document-model'
import { formatLessonDateRu, rovLessonNumber } from '@/lib/scenario/rov-date'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const meta: ExportMeta = {
  topic: 'О дружбе',
  direction: 'Патриотическое',
  grade: 3,
  durationMin: 40,
  format: 'Беседа',
  lessonType: 'rov',
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
      { label: 'Тип занятия', value: 'Разговоры о важном' },
      { label: 'Тема', value: 'О дружбе' },
      { label: 'Направление воспитания', value: 'Патриотическое' },
      { label: 'Класс / уровень', value: '3 класс (НОО)' },
      { label: 'Группа РоВ', value: '3–4 классы' },
      { label: 'Длительность', value: '40 мин' },
      { label: 'Формат', value: 'Беседа' },
      { label: 'Форма проведения', value: 'беседа с элементами дискуссии' },
      { label: 'Цель занятия', value: 'Понять ценность дружбы (и др.)' },
      { label: 'Оборудование', value: 'Карточки, Проектор' },
    ])
  })

  it('выводит цели: первая — абзацем, остальные — задачами списком', () => {
    const blocks = buildScenarioDocument(content, meta)
    const idx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Цель')
    expect(idx).toBeGreaterThan(-1)
    expect(blocks[idx + 1]).toEqual({ type: 'paragraph', text: 'Понять ценность дружбы' })
    const idxTasks = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Задачи')
    expect(idxTasks).toBeGreaterThan(-1)
    expect(blocks[idxTasks + 1]).toEqual({
      type: 'bullets',
      items: ['Научиться договариваться'],
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
  lessonType: 'rov',
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

describe('document-model — адаптация по lessonType', () => {
  const baseContent = {
    title: 'Тестовый сценарий',
    goals: ['Цель'],
    materials: [],
    stages: [
      {
        kind: 'engage',
        title: 'Вход',
        duration_min: 5,
        activities: [{ type: 'discussion', text: 'X' }],
      },
    ],
    adaptations: { simpler: 's', harder: 'h' },
  } as any
  const baseMeta = {
    direction: 'Патриотическое',
    grade: 6,
    durationMin: 30,
    format: 'беседа',
    lessonType: 'rov' as const,
    topic: 'Дружба',
  } as any

  it('rov: первая строка metaTable — "Тип занятия: Разговоры о важном"', () => {
    const doc = buildScenarioDocument(baseContent, baseMeta)
    const metaBlock = doc.find((b: any) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows[0]).toEqual({ label: 'Тип занятия', value: 'Разговоры о важном' })
  })

  it('subject_extension: строка "Предмет: Физика"', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, subject: 'Физика' },
      { ...baseMeta, lessonType: 'subject_extension', direction: undefined },
    )
    const metaBlock = doc.find((b: any) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.some((r: any) => r.label === 'Предмет' && r.value === 'Физика')).toBe(
      true,
    )
    expect(metaBlock.rows.some((r: any) => r.label === 'Направление воспитания')).toBe(false)
  })

  it('literacy: строка "Вид грамотности"', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, literacyKind: 'math' },
      { ...baseMeta, lessonType: 'literacy', direction: undefined },
    )
    const metaBlock = doc.find((b: any) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(
      metaBlock.rows.some(
        (r: any) => r.label === 'Вид грамотности' && r.value === 'Математическая грамотность',
      ),
    ).toBe(true)
  })

  it('krujok: главный классификатор скрыт', () => {
    const doc = buildScenarioDocument(baseContent, {
      ...baseMeta,
      lessonType: 'krujok',
      direction: undefined,
    })
    const metaBlock = doc.find((b: any) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(
      metaBlock.rows.some(
        (r: any) =>
          r.label === 'Направление воспитания' ||
          r.label === 'Предмет' ||
          r.label === 'Вид грамотности',
      ),
    ).toBe(false)
  })

  it('блок «Метапредметные результаты» — рендерится только при непустом', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, metaResults: ['уметь работать с информацией'] },
      baseMeta,
    )
    const headings = doc.filter((b: any) => b.type === 'heading').map((b: any) => b.text)
    expect(headings).toContain('Планируемые метапредметные результаты')
  })

  it('блок «Предметные результаты» — рендерится только при непустом', () => {
    const doc = buildScenarioDocument(
      { ...baseContent, subjectResults: ['решать задачи на оптимизацию'] },
      baseMeta,
    )
    const headings = doc.filter((b: any) => b.type === 'heading').map((b: any) => b.text)
    expect(headings).toContain('Планируемые предметные результаты')
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

// Minimal fixture for РоВ-compliance tests
const rovContent: ScenarioContent = {
  title: 'Тест',
  goals: ['Одна цель'],
  materials: [],
  stages: [
    {
      kind: 'engage',
      title: 'Вход',
      duration_min: 5,
      activities: [{ type: 'discussion', text: 'X' }],
    },
  ],
  adaptations: { simpler: 's', harder: 'h' },
}

const rovMeta: ExportMeta = {
  topic: 'Дружба',
  direction: 'Патриотическое',
  grade: 7,
  durationMin: 30,
  format: 'беседа',
  lessonType: 'rov',
}

describe('buildScenarioDocument — РоВ-compliance fields', () => {
  it('1. rov + leadingValue + secondaryValues → строки «Формируемая ценность» и «Сопутствующие ценности» в шапке', () => {
    const doc = buildScenarioDocument(
      { ...rovContent, leadingValue: 'дружба', secondaryValues: ['честность', 'смелость'] },
      rovMeta,
    )
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    const leading = metaBlock.rows.find((r) => r.label === 'Формируемая ценность (ведущая)')
    expect(leading?.value).toBe('дружба')
    const secondary = metaBlock.rows.find((r) => r.label === 'Сопутствующие ценности')
    expect(secondary?.value).toBe('честность, смелость')
  })

  it('2. rov + lessonDate (понедельник в цикле РоВ) → «Дата проведения» с датой и номером занятия', () => {
    // 2026-09-07 = first Monday of September 2026 = lesson #1
    const date = '2026-09-07'
    const doc = buildScenarioDocument({ ...rovContent, lessonDate: date }, rovMeta)
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    const row = metaBlock.rows.find((r) => r.label === 'Дата проведения')
    expect(row).toBeDefined()
    expect(row?.value).toContain(formatLessonDateRu(date))
    const lessonNum = rovLessonNumber(date)
    expect(lessonNum).not.toBeNull()
    expect(row?.value).toContain(`(занятие №${lessonNum} цикла РоВ)`)
  })

  it('3. rov + lessonDate (понедельник вне цикла РоВ) → «Дата проведения» без суффикса №N', () => {
    // 2026-08-03 = Monday, but school year hasn't started → rovLessonNumber returns null
    const date = '2026-08-03'
    const doc = buildScenarioDocument({ ...rovContent, lessonDate: date }, rovMeta)
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    const row = metaBlock.rows.find((r) => r.label === 'Дата проведения')
    expect(row).toBeDefined()
    expect(row?.value).toContain(formatLessonDateRu(date))
    expect(rovLessonNumber(date)).toBeNull()
    expect(row?.value).not.toContain('цикла РоВ')
  })

  it('4. rov + grade=7 → «Группа РоВ: 5–7 классы» в шапке', () => {
    const doc = buildScenarioDocument(rovContent, rovMeta) // grade=7
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    const row = metaBlock.rows.find((r) => r.label === 'Группа РоВ')
    expect(row?.value).toBe('5–7 классы')
  })

  it('5. rov + leadingValue + legacy values → только новый ряд, без устаревшего «Формируемые ценности»', () => {
    const doc = buildScenarioDocument(
      { ...rovContent, leadingValue: 'дружба', values: ['память', 'долг'] },
      rovMeta,
    )
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.some((r) => r.label === 'Формируемые ценности')).toBe(false)
    expect(metaBlock.rows.some((r) => r.label === 'Формируемая ценность (ведущая)')).toBe(true)
  })

  it('6. non-rov (krujok) + leadingValue + lessonDate → РоВ-специфичные строки не появляются', () => {
    const krujokMeta: ExportMeta = { ...rovMeta, lessonType: 'krujok', direction: undefined }
    const doc = buildScenarioDocument(
      { ...rovContent, leadingValue: 'дружба', lessonDate: '2026-09-07' },
      krujokMeta,
    )
    const metaBlock = doc.find((b) => b.type === 'metaTable')
    if (metaBlock?.type !== 'metaTable') throw new Error('expected metaTable')
    expect(metaBlock.rows.some((r) => r.label === 'Группа РоВ')).toBe(false)
    expect(metaBlock.rows.some((r) => r.label === 'Дата проведения')).toBe(false)
    expect(metaBlock.rows.some((r) => r.label === 'Формируемая ценность (ведущая)')).toBe(false)
    expect(metaBlock.rows.some((r) => r.label === 'Сопутствующие ценности')).toBe(false)
  })

  it('7. goals с одним элементом → heading «Цель» + paragraph, без «Задачи»', () => {
    const doc = buildScenarioDocument({ ...rovContent, goals: ['только одна цель'] }, rovMeta)
    const idx = doc.findIndex((b) => b.type === 'heading' && b.text === 'Цель')
    expect(idx).toBeGreaterThan(-1)
    expect(doc[idx + 1]).toEqual({ type: 'paragraph', text: 'только одна цель' })
    expect(doc.some((b) => b.type === 'heading' && b.text === 'Задачи')).toBe(false)
  })

  it('8. goals с тремя элементами → «Цель» + paragraph(goals[0]) + «Задачи» + bullets(goals[1..])', () => {
    const doc = buildScenarioDocument(
      { ...rovContent, goals: ['главная цель', 'задача 1', 'задача 2'] },
      rovMeta,
    )
    const idxGoal = doc.findIndex((b) => b.type === 'heading' && b.text === 'Цель')
    expect(idxGoal).toBeGreaterThan(-1)
    expect(doc[idxGoal + 1]).toEqual({ type: 'paragraph', text: 'главная цель' })
    const idxTasks = doc.findIndex((b) => b.type === 'heading' && b.text === 'Задачи')
    expect(idxTasks).toBeGreaterThan(-1)
    expect(doc[idxTasks + 1]).toEqual({ type: 'bullets', items: ['задача 1', 'задача 2'] })
    // Tasks heading is after Goal heading
    expect(idxTasks).toBeGreaterThan(idxGoal)
  })

  it('9. rov + valueFormulations → блок «Формулировки ценностей на занятии» с буллетами', () => {
    const doc = buildScenarioDocument(
      {
        ...rovContent,
        valueFormulations: [
          { text: 'Родина — это место', basedOn: 'патриотизм' as never },
          { text: 'Дружба важна', basedOn: 'дружба' as never },
        ],
      },
      rovMeta,
    )
    const idx = doc.findIndex(
      (b) => b.type === 'heading' && b.text === 'Формулировки ценностей на занятии',
    )
    expect(idx).toBeGreaterThan(-1)
    const next = doc[idx + 1]
    expect(next.type).toBe('bullets')
    if (next.type === 'bullets') {
      expect(next.items).toContain('Родина — это место (патриотизм)')
      expect(next.items).toContain('Дружба важна (дружба)')
    }
  })

  it('10. non-rov + valueFormulations → блок «Формулировки ценностей» не добавляется', () => {
    const krujokMeta: ExportMeta = { ...rovMeta, lessonType: 'krujok', direction: undefined }
    const doc = buildScenarioDocument(
      {
        ...rovContent,
        valueFormulations: [{ text: 'Текст', basedOn: 'дружба' as never }],
      },
      krujokMeta,
    )
    expect(
      doc.some((b) => b.type === 'heading' && b.text === 'Формулировки ценностей на занятии'),
    ).toBe(false)
  })
})

describe('buildScenarioDocument — videoLink', () => {
  it('video с videoSearchQuery даёт videoLink после paragraph активности', () => {
    const doc = buildScenarioDocument(
      {
        ...rovContent,
        stages: [
          {
            kind: 'engage',
            title: 'Вход',
            duration_min: 5,
            activities: [
              { type: 'video', text: 'Посмотрите ролик', videoSearchQuery: 'Дружба школьники' },
            ],
          },
        ],
      },
      rovMeta,
    )
    const paraIdx = doc.findIndex(
      (b) => b.type === 'paragraph' && b.text.includes('Посмотрите ролик'),
    )
    expect(paraIdx).toBeGreaterThan(-1)
    const next = doc[paraIdx + 1]
    expect(next.type).toBe('videoLink')
    if (next.type === 'videoLink') {
      expect(next.query).toBe('Дружба школьники')
      expect(next.url).toBe(
        'https://rutube.ru/search/?query=%D0%94%D1%80%D1%83%D0%B6%D0%B1%D0%B0%20%D1%88%D0%BA%D0%BE%D0%BB%D1%8C%D0%BD%D0%B8%D0%BA%D0%B8',
      )
    }
  })

  it('video без videoSearchQuery НЕ даёт videoLink', () => {
    const doc = buildScenarioDocument(
      {
        ...rovContent,
        stages: [
          {
            kind: 'engage',
            title: 'Вход',
            duration_min: 5,
            activities: [{ type: 'video', text: 'Посмотрите ролик' }],
          },
        ],
      },
      rovMeta,
    )
    expect(doc.some((b) => b.type === 'videoLink')).toBe(false)
  })
})
