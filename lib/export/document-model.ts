import { gradeToLevel, levelLabel } from '@/lib/scenario/levels'
import {
  type LessonType,
  type LiteracyKind,
  formatGrade,
  lessonTypeLabel,
  literacyKindLabel,
} from '@/lib/scenario/options'
import type { ScenarioContent } from '@/lib/scenario/schema'

export type ExportMeta = {
  topic: string
  direction?: string
  grade: number
  durationMin: number
  format: string
  lessonType: LessonType
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

  const audience = `${formatGrade(meta.grade)} (${levelLabel(gradeToLevel(meta.grade))})`
  const goalValue =
    content.goals.length > 0 ? content.goals[0] + (content.goals.length > 1 ? ' (и др.)' : '') : '—'

  const mainClassifier: { label: string; value: string } | null =
    (meta.lessonType === 'rov' || meta.lessonType === 'event') && meta.direction
      ? { label: 'Направление воспитания', value: meta.direction }
      : meta.lessonType === 'subject_extension' && content.subject
        ? { label: 'Предмет', value: content.subject }
        : meta.lessonType === 'literacy' && content.literacyKind
          ? {
              label: 'Вид грамотности',
              value: literacyKindLabel(content.literacyKind as LiteracyKind),
            }
          : null

  const metaRows: { label: string; value: string }[] = [
    { label: 'Тип занятия', value: lessonTypeLabel(meta.lessonType) },
    { label: 'Тема', value: meta.topic || '—' },
    ...(mainClassifier ? [mainClassifier] : []),
    { label: 'Класс / уровень', value: audience },
    { label: 'Длительность', value: `${meta.durationMin} мин` },
    { label: 'Формат', value: meta.format },
    { label: 'Цель занятия', value: goalValue },
  ]
  if (content.values && content.values.length > 0) {
    metaRows.push({ label: 'Формируемые ценности', value: content.values.join(', ') })
  }
  if (content.materials.length > 0) {
    metaRows.push({ label: 'Оборудование', value: content.materials.join(', ') })
  }
  blocks.push({ type: 'metaTable', rows: metaRows })

  blocks.push({ type: 'heading', level: 2, text: 'Цель' })
  blocks.push({ type: 'bullets', items: content.goals })

  if (content.coreMeanings && content.coreMeanings.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Основные смыслы' })
    blocks.push({ type: 'bullets', items: content.coreMeanings })
  }

  if (content.personalResults && content.personalResults.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Планируемые личностные результаты' })
    blocks.push({ type: 'bullets', items: content.personalResults })
  }

  if (content.metaResults && content.metaResults.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Планируемые метапредметные результаты' })
    blocks.push({ type: 'bullets', items: content.metaResults })
  }

  if (content.subjectResults && content.subjectResults.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: 'Планируемые предметные результаты' })
    blocks.push({ type: 'bullets', items: content.subjectResults })
  }

  let stageNum = 0
  for (const stage of content.stages) {
    let heading: string
    if (stage.kind === 'reflection') {
      heading = `Рефлексия (${stage.duration_min} мин)`
    } else {
      stageNum += 1
      heading = `Этап ${stageNum}. ${stage.title} (${stage.duration_min} мин)`
    }
    blocks.push({ type: 'heading', level: 2, text: heading })

    for (const act of stage.activities) {
      const label = ACTIVITY_TYPE_LABEL[act.type] ?? act.type
      blocks.push({ type: 'paragraph', text: `${label}. ${act.text}` })
      if (act.questions && act.questions.length > 0) {
        blocks.push({ type: 'bullets', items: act.questions })
      }
    }
  }

  blocks.push({ type: 'heading', level: 2, text: 'Адаптация' })
  blocks.push({ type: 'paragraph', text: `Проще: ${content.adaptations.simpler}` })
  blocks.push({ type: 'paragraph', text: `Сложнее: ${content.adaptations.harder}` })

  blocks.push({
    type: 'paragraph',
    text: 'Сценарий сгенерирован ИИ-сервисом и может содержать неточности. Проверьте факты перед проведением занятия.',
  })

  return blocks
}
