import type { LessonType } from '../options'
import type { GenerationInput, ScenarioSkeleton } from '../schema'
import * as Krujok from './krujok'
import * as Rov from './rov'
import type { PromptDeps } from './shared'

export type { ChatMessage, PromptDeps } from './shared'
export type { RagChunkForPrompt, SharedExampleForPrompt } from './shared'

/**
 * Диспетчер сборки промпта по типу занятия.
 *
 * Task 9: РоВ-логика переехала в ./rov.ts.
 * Tasks 10-13 постепенно переключат каждый оставшийся case на свой модуль.
 * До тех пор non-rov типы используют РоВ-логику как placeholder (поведение не меняется).
 */
export function buildSkeletonMessages(input: GenerationInput, deps: PromptDeps): Rov.ChatMessage[] {
  const { chunks = [], examples = [], userMaterial = '' } = deps
  switch (input.lessonType) {
    case 'rov':
      return Rov.buildRovSkeletonMessages(input, chunks, examples, userMaterial ?? '')
    case 'krujok':
      return Krujok.buildKrujokSkeletonMessages(input, chunks, examples, userMaterial ?? '')
    case 'literacy':
    case 'subject_extension':
    case 'event':
      // Tasks 11-13 переключат каждый case на свой модуль.
      // Временно используем РоВ-логику — поведение идентично прежнему (всё было на РоВ-промпте).
      return Rov.buildRovSkeletonMessages(input, chunks, examples, userMaterial ?? '')
    default: {
      const _exhaustive: never = input.lessonType
      throw new Error(`Unknown lessonType: ${String(_exhaustive)}`)
    }
  }
}

export function buildBlockMessages(
  input: GenerationInput,
  skeleton: ScenarioSkeleton,
  stage: { kind: string; title: string; duration_min: number },
  brief: { type: string; focus: string },
  ragChunks: Rov.RagChunkForPrompt[] = [],
  runningContext = '',
  userMaterial = '',
): Rov.ChatMessage[] {
  if (input.lessonType === 'rov') {
    return Rov.buildRovBlockMessages(
      input,
      skeleton,
      stage,
      brief,
      ragChunks,
      runningContext,
      userMaterial,
    )
  }
  if (input.lessonType === 'krujok') {
    return Krujok.buildKrujokBlockMessages(
      input,
      skeleton,
      stage,
      brief,
      ragChunks,
      runningContext,
      userMaterial,
    )
  }
  // Tasks 11-13 разнесут остальные типы. Временно — РоВ-логика.
  return Rov.buildRovBlockMessages(
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
      return Rov.PROMPT_VERSION
    case 'krujok':
      return Krujok.PROMPT_VERSION
    case 'literacy':
      return 'v1-literacy-2026-05-30'
    case 'subject_extension':
      return 'v1-subject-2026-05-30'
    case 'event':
      return 'v1-event-2026-05-30'
  }
}
