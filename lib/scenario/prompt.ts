// Тонкий barrel — логика по типу занятия переехала в lib/scenario/prompts/.
// Все вызывающие могут продолжать импортировать отсюда — совместимость сохранена.
// В следующих итерациях (Tasks 10-13) импорты будут переведены на @/lib/scenario/prompts напрямую.

export type { ChatMessage, RagChunkForPrompt, SharedExampleForPrompt } from './prompts/shared'

// PROMPT_VERSION для совместимости — РоВ-версия как дефолт
export { PROMPT_VERSION } from './prompts/rov'

// Все функции — из РоВ-модуля (flat-сигнатура сохранена для всех существующих вызывающих).
// Для диспетчеризации по lessonType — использовать @/lib/scenario/prompts напрямую.
export {
  buildMessages,
  buildSkeletonMessages,
  buildBlockMessages,
} from './prompts/rov'
