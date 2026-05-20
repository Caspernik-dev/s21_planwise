import { z } from 'zod'
import { DIRECTIONS, FORMATS } from './options'

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
  grade: z.coerce.number().int().min(1).max(11),
  topic: z.string().trim().min(1, 'Укажите тему').max(200),
  durationMin: z.coerce.number().int().min(5).max(120),
  format: z.enum(FORMATS),
})

export type GenerationInput = z.infer<typeof generationInputSchema>

export type GenerationMeta = {
  model: string
  promptVersion: string
  repaired: boolean
  normalized: boolean
  usage: { promptTokens: number; completionTokens: number } | null
  latencyMs: number
}
