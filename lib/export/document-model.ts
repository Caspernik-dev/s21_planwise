import type { ScenarioContent } from '@/lib/scenario/schema'

export type ExportMeta = {
  title: string
  topic: string
  direction: string
  grade: number
  durationMin: number
  format: string
}

export type DocBlock =
  | { type: 'heading'; level: 1 | 2; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'metaTable'; rows: { label: string; value: string }[] }

export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  discussion: 'Обсуждение',
  quiz: 'Викторина',
  game: 'Игра',
  task: 'Задание',
  video: 'Видео',
}

export function buildScenarioDocument(content: ScenarioContent, meta: ExportMeta): DocBlock[] {
  const blocks: DocBlock[] = []

  blocks.push({ type: 'heading', level: 1, text: content.title })
  blocks.push({
    type: 'metaTable',
    rows: [
      { label: 'Тема', value: meta.topic },
      { label: 'Направление', value: meta.direction },
      { label: 'Класс', value: String(meta.grade) },
      { label: 'Длительность', value: `${meta.durationMin} мин` },
      { label: 'Формат', value: meta.format },
    ],
  })

  blocks.push({ type: 'heading', level: 2, text: 'Цель' })
  blocks.push({ type: 'bullets', items: content.goals })

  content.stages.forEach((stage, i) => {
    const heading =
      stage.kind === 'reflection'
        ? `Рефлексия (${stage.duration_min} мин)`
        : `Этап ${i + 1}. ${stage.title} (${stage.duration_min} мин)`
    blocks.push({ type: 'heading', level: 2, text: heading })

    for (const act of stage.activities) {
      const label = ACTIVITY_TYPE_LABEL[act.type] ?? act.type
      blocks.push({ type: 'paragraph', text: `${label}. ${act.text}` })
      if (act.questions && act.questions.length > 0) {
        blocks.push({ type: 'bullets', items: act.questions })
      }
    }
  })

  if (content.materials.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Материалы' })
    blocks.push({ type: 'bullets', items: content.materials })
  }

  blocks.push({ type: 'heading', level: 2, text: 'Адаптация' })
  blocks.push({ type: 'paragraph', text: `Проще: ${content.adaptations.simpler}` })
  blocks.push({ type: 'paragraph', text: `Сложнее: ${content.adaptations.harder}` })

  return blocks
}
