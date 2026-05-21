import type { RagChunkForPrompt } from '@/lib/scenario/prompt'
import { chunksForStage } from '@/lib/scenario/stage-chunks'
import { describe, expect, it } from 'vitest'

const mk = (sectionKind: string, text: string): RagChunkForPrompt => ({
  text,
  documentTitle: 'РоВ',
  sectionKind,
})

const chunks = [
  mk('stage', 'основная'),
  mk('reflection', 'рефлексия'),
  mk('goal', 'цель'),
  mk('materials', 'материалы'),
]

describe('chunksForStage', () => {
  it('рефлексия предпочитает reflection-чанки', () => {
    const r = chunksForStage(chunks, 'reflection')
    expect(r.some((c) => c.sectionKind === 'reflection')).toBe(true)
    expect(r.every((c) => ['reflection', 'other'].includes(c.sectionKind))).toBe(true)
  })

  it('основная часть берёт stage/goal/materials', () => {
    const r = chunksForStage(chunks, 'main')
    expect(r.some((c) => c.sectionKind === 'stage')).toBe(true)
    expect(r.every((c) => c.sectionKind !== 'reflection')).toBe(true)
  })

  it('пустой вход → пустой выход', () => {
    expect(chunksForStage([], 'main')).toEqual([])
  })

  it('фолбэк на все чанки, если предпочтительных нет', () => {
    const only = [mk('reflection', 'р1'), mk('reflection', 'р2')]
    // для engage предпочтительных (stage/goal/other) нет → берём всё
    expect(chunksForStage(only, 'engage').length).toBe(2)
  })

  it('ограничивает количество лимитом', () => {
    const many = Array.from({ length: 6 }, (_, i) => mk('stage', `c${i}`))
    expect(chunksForStage(many, 'main', 3)).toHaveLength(3)
  })
})
