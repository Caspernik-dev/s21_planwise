import { formatGrade } from '@/lib/scenario/options'
import type { ScenarioContent } from '@/lib/scenario/schema'

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  discussion: 'Беседа / обсуждение',
  quiz: 'Квиз',
  game: 'Игра',
  task: 'Задание',
  video: 'Видео / презентация',
}

export type SlideBlock = { typeLabel: string; questions?: string[]; text?: string }

export type Slide =
  | { kind: 'title'; title: string; badges: string[] }
  | { kind: 'stage'; title: string; durationMin: number; blocks: SlideBlock[] }

type SlideMeta = { direction: string; grade: number; durationMin: number; format: string }

export function buildSlides(content: ScenarioContent, meta: SlideMeta): Slide[] {
  const title: Slide = {
    kind: 'title',
    title: content.title,
    badges: [meta.direction, formatGrade(meta.grade), `${meta.durationMin} мин`, meta.format],
  }

  const stages: Slide[] = content.stages.map((stage) => ({
    kind: 'stage',
    title: stage.title,
    durationMin: stage.duration_min,
    blocks: stage.activities.map((activity) => {
      const typeLabel = ACTIVITY_TYPE_LABEL[activity.type] ?? activity.type
      // Для video-активности с videoSearchQuery — отдельный буллет с поисковым запросом
      // под существующими вопросами/текстом. Учителю видно, что искать, прямо в показе.
      const rutubeBullet =
        activity.type === 'video' && activity.videoSearchQuery
          ? `🔍 RuTube: ${activity.videoSearchQuery}`
          : null

      if (activity.questions && activity.questions.length > 0) {
        const questions = rutubeBullet ? [...activity.questions, rutubeBullet] : activity.questions
        return { typeLabel, questions }
      }
      if (rutubeBullet) {
        return { typeLabel, questions: [rutubeBullet], text: activity.text }
      }
      return { typeLabel, text: activity.text }
    }),
  }))

  return [title, ...stages]
}
