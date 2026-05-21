import type { RagChunkForPrompt } from './prompt'

// Распределяем уже найденные RAG-чанки по этапам через sectionKind — чтобы на каждый
// этап шла релевантная ему методическая опора (рефлексия → reflection-чанки и т.д.),
// без дополнительных запросов к БД.
const PREFERRED_KINDS: Record<string, string[]> = {
  engage: ['stage', 'goal', 'other'],
  main: ['stage', 'goal', 'materials', 'other'],
  reflection: ['reflection', 'other'],
}

export function chunksForStage(
  chunks: RagChunkForPrompt[],
  stageKind: string,
  limit = 3,
): RagChunkForPrompt[] {
  if (chunks.length === 0) return []
  const prefs = PREFERRED_KINDS[stageKind] ?? []
  const preferred = chunks.filter((c) => prefs.includes(c.sectionKind))
  const pool = preferred.length > 0 ? preferred : chunks
  return pool.slice(0, limit)
}
