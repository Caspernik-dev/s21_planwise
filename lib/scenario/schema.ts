import { z } from 'zod'
import { DIRECTIONS, FORMATS, SPO_GRADE } from './options'

export const activitySchema = z.object({
  type: z.enum(['discussion', 'quiz', 'game', 'task', 'video']),
  text: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
})

export const stageSchema = z.object({
  kind: z.enum(['engage', 'main', 'reflection']),
  title: z.string().min(1),
  duration_min: z.number().int().positive(),
  activities: z.array(activitySchema).min(1),
})

export const scenarioContentSchema = z.object({
  title: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  values: z.array(z.string()).optional(), // формируемые ценности (РоВ)
  coreMeanings: z.array(z.string()).optional(), // основные смыслы (РоВ)
  materials: z.array(z.string()),
  stages: z.array(stageSchema).min(1),
  adaptations: z.object({
    simpler: z.string().min(1),
    harder: z.string().min(1),
  }),
})

export type ScenarioContent = z.infer<typeof scenarioContentSchema>
export type ScenarioStage = z.infer<typeof stageSchema>

export const generationInputSchema = z.object({
  direction: z.enum(DIRECTIONS),
  grade: z.coerce.number().int().min(1).max(SPO_GRADE),
  topic: z.string().trim().min(1, 'Укажите тему').max(200),
  durationMin: z.coerce.number().int().min(5).max(120),
  format: z.enum(FORMATS),
  userMaterial: z.string().max(20_000).optional(),
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
