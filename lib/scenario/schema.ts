import { z } from 'zod'
import type { LessonType } from './options'
import {
  DIRECTIONS,
  FORMATS,
  LESSON_TYPE_VALUES,
  LITERACY_KINDS,
  SPO_GRADE,
  formatGrade,
} from './options'
import { isMonday } from './rov-date'
import { VALUES_809 } from './values-809'

export const activitySchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  text: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
  // Поисковой запрос на RuTube для type:'video'. Не URL, не название ролика — 3-5 ключевых слов.
  // Санитизация и fallback — в lib/scenario/rutube.ts.
  videoSearchQuery: z.string().min(1).max(120).optional(),
})

export const stageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.number().int().positive(),
  activities: z.array(activitySchema).min(1),
})

const literacyKindValues = LITERACY_KINDS.map((k) => k.value) as [string, ...string[]]

export const scenarioContentSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(), // формируемые ценности (РоВ)
  coreMeanings: z.array(z.string()).optional(), // основные смыслы (РоВ)
  personalResults: z.array(z.string().min(1)).max(8).optional(),
  metaSubjectResults: z
    .object({
      cognitive: z.array(z.string().min(1)).max(3).optional(),
      communicative: z.array(z.string().min(1)).max(3).optional(),
      regulatory: z.array(z.string().min(1)).max(3).optional(),
    })
    .optional(),
  lessonDate: z.string().optional(),
  leadingValue: z.enum(VALUES_809 as unknown as [string, ...string[]]).optional(),
  secondaryValues: z
    .array(z.enum(VALUES_809 as unknown as [string, ...string[]]))
    .max(3)
    .optional(),
  valueFormulations: z
    .array(
      z.object({
        text: z.string().min(1),
        basedOn: z.enum(VALUES_809 as unknown as [string, ...string[]]),
      }),
    )
    .max(8)
    .optional(),
  metaResults: z.array(z.string().min(1)).max(10).optional(),
  subjectResults: z.array(z.string().min(1)).max(10).optional(),
  subject: z.string().min(1).max(80).optional(),
  literacyKind: z.enum(literacyKindValues).optional(),
  materials: z.array(z.string()),
  stages: z.array(stageSchema).min(1),
  adaptations: z.object({
    simpler: z.string().min(1),
    harder: z.string().min(1),
  }),
})

export type ScenarioContent = z.infer<typeof scenarioContentSchema>
export type ScenarioStage = z.infer<typeof stageSchema>

export const generationInputSchema = z
  .object({
    lessonType: z.enum(LESSON_TYPE_VALUES as unknown as [LessonType, ...LessonType[]]),
    direction: z.enum(DIRECTIONS).optional(),
    subject: z.string().trim().min(1).max(80).optional(),
    literacyKind: z.enum(literacyKindValues).optional(),
    grade: z.coerce.number().int().min(1).max(SPO_GRADE),
    topic: z.string().trim().min(1, 'Укажите тему').max(200),
    durationMin: z.coerce.number().int().min(5).max(120),
    format: z.enum(FORMATS),
    lessonDate: z.string().optional(),
    userMaterial: z.string().max(20_000).optional(),
  })
  .superRefine((data, ctx) => {
    const cap = data.grade === 1 ? 35 : 45
    if (data.durationMin > cap) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMin'],
        message:
          data.grade === 1
            ? 'Для 1 класса длительность занятия не более 35 мин (СанПиН).'
            : `Для ${formatGrade(data.grade)} длительность занятия не более 45 мин (СанПиН).`,
      })
    }
    if ((data.lessonType === 'rov' || data.lessonType === 'event') && !data.direction) {
      ctx.addIssue({
        code: 'custom',
        path: ['direction'],
        message: 'Выберите направление воспитания.',
      })
    }
    if (data.lessonType === 'subject_extension' && !data.subject) {
      ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Укажите школьный предмет.' })
    }
    if (data.lessonType === 'literacy' && !data.literacyKind) {
      ctx.addIssue({
        code: 'custom',
        path: ['literacyKind'],
        message: 'Выберите вид функциональной грамотности.',
      })
    }
    if (data.lessonType === 'rov' && data.lessonDate !== undefined && !isMonday(data.lessonDate)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lessonDate'],
        message: 'Дата проведения РоВ — только понедельник.',
      })
    }
  })

export type GenerationInput = z.infer<typeof generationInputSchema>

export const skeletonBlockSchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  focus: z.string().min(1),
})

export const skeletonStageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.coerce.number().int().min(0),
  blocks: z.array(skeletonBlockSchema).min(1).optional(),
})

export type SkeletonBlock = z.infer<typeof skeletonBlockSchema>

export const skeletonSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(),
  coreMeanings: z.array(z.string()).optional(),
  personalResults: z.array(z.string()).optional(),
  metaSubjectResults: z
    .object({
      cognitive: z.array(z.string()).optional(),
      communicative: z.array(z.string()).optional(),
      regulatory: z.array(z.string()).optional(),
    })
    .optional(),
  lessonDate: z.string().optional(),
  leadingValue: z.string().optional(),
  secondaryValues: z.array(z.string()).optional(),
  valueFormulations: z
    .array(z.object({ text: z.string(), basedOn: z.string() }).partial())
    .optional(),
  metaResults: z.array(z.string()).optional(),
  subjectResults: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  // адаптации в каркасе мягкие: модель часто шлёт {} или частичный объект; недостающие
  // поля доводятся дефолтами при сборке (см. stream.ts). Строгая проверка — на финальном
  // scenarioContentSchema.
  adaptations: z.object({ simpler: z.string(), harder: z.string() }).partial().optional(),
  stages: z.array(skeletonStageSchema).min(1),
})

export type ScenarioSkeleton = z.infer<typeof skeletonSchema>

export type GenerationMeta = {
  model: string
  promptVersion: string
  repaired: boolean
  normalized: boolean
  usage: { promptTokens: number; completionTokens: number } | null
  latencyMs: number
  usedChunkIds: string[]
  thinBlocks?: number
  qualityWarnings?: string[]
}
