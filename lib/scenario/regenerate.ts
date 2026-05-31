import { chatCompletion } from '@/lib/gigachat/client'
import type { ChatResult, GigaMessage } from '@/lib/gigachat/types'
import { type Activity, generateBlockWithGate } from './block-gen'
import { coerceActivityType } from './coerce'
import { buildBlockMessages } from './prompts'
import type { RagChunkForPrompt } from './prompts/shared'
import type { GenerationInput, ScenarioSkeleton } from './schema'

type ChatFn = (messages: GigaMessage[], opts?: { temperature?: number }) => Promise<ChatResult>

export type RegenerateArgs = {
  input: GenerationInput
  skeleton: ScenarioSkeleton
  stage: { kind: string; title: string; duration_min: number }
  targetType: string
  runningContext: string
}

export type RegenerateDeps = { chat?: ChatFn; ragChunks?: RagChunkForPrompt[] }

// Регенерация ОДНОЙ активности тем же per-block пайплайном, что и полная генерация:
// роль этапа + основные смыслы + катящийся контекст соседних блоков + гейт качества.
// Итоговый тип форсится по выбору учителя (защита от «игры во введении»).
export async function regenerateActivity(
  args: RegenerateArgs,
  deps: RegenerateDeps = {},
): Promise<Activity> {
  const chat = deps.chat ?? chatCompletion
  const brief = { type: args.targetType, focus: args.stage.title }
  const msgs = buildBlockMessages(
    args.input,
    args.skeleton,
    args.stage,
    brief,
    deps.ragChunks ?? [],
    args.runningContext,
  )
  const res = await generateBlockWithGate(chat, msgs, args.stage.kind, {
    lessonType: args.input.lessonType,
    videoCtx: {
      topic: args.input.topic,
      direction: args.input.direction,
      leadingValue: args.skeleton.leadingValue,
    },
  })
  if (!res) throw new Error('GigaChat вернул невалидный блок при регенерации')
  return { ...res.value, type: coerceActivityType(args.targetType) as Activity['type'] }
}
