import type { LessonType } from '../options'
import * as Legacy from '../prompt'
import type { GenerationInput, ScenarioSkeleton } from '../schema'
import type { PromptDeps } from './shared'

export type { ChatMessage, PromptDeps } from './shared'
export type { RagChunkForPrompt, SharedExampleForPrompt } from './shared'

/**
 * Диспетчер сборки промпта по типу занятия.
 *
 * На этом этапе ВСЕ типы делегируют в существующий `lib/scenario/prompt.ts` (РоВ-логика).
 * Tasks 9-13 постепенно переключат каждый case на свой модуль (`./rov`, `./krujok`, ...).
 *
 * Когда все типы переедут, `lib/scenario/prompt.ts` станет тонким реэкспортом
 * из этого index.ts (см. Task 9).
 */
export function buildSkeletonMessages(
  input: GenerationInput,
  deps: PromptDeps,
): Legacy.ChatMessage[] {
  const { chunks = [], examples = [], userMaterial = '' } = deps
  switch (input.lessonType) {
    case 'rov':
    case 'krujok':
    case 'literacy':
    case 'subject_extension':
    case 'event':
      return Legacy.buildSkeletonMessages(input, chunks, examples, userMaterial ?? '')
    default:
      throw new Error(`Unknown lessonType: ${input.lessonType}`)
  }
}

export function buildBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: Legacy.RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): Legacy.ChatMessage[] {
  // На этом этапе аргументы не зависят от типа — Task 9 разнесёт.
  return Legacy.buildBlockMessages(
    input,
    skeleton,
    stage,
    brief,
    ragChunks,
    runningContext,
    userMaterial,
  )
}

export function getPromptVersion(lessonType: LessonType): string {
  switch (lessonType) {
    case 'rov':
      return 'v10-rov-2026-05-30'
    case 'krujok':
      return 'v1-krujok-2026-05-30'
    case 'literacy':
      return 'v1-literacy-2026-05-30'
    case 'subject_extension':
      return 'v1-subject-2026-05-30'
    case 'event':
      return 'v1-event-2026-05-30'
  }
}
