import { ingestDocument } from '@/lib/rag/ingest'
import { describe, expect, it, vi } from 'vitest'

function fakeDeps(existingHashes: string[] = []) {
  const insertedChunks: Array<{ chunkHash: string }> = []
  const insertedDocs: Array<{ rawUrl: string }> = []
  const embed = vi.fn(async (texts: string[]) => texts.map(() => Array(1024).fill(0.1)))

  const db = {
    existingHashesFor: vi.fn(async () => new Set(existingHashes)),
    upsertDocument: vi.fn(async (doc: { rawUrl: string }) => {
      insertedDocs.push(doc)
      return 'doc-id'
    }),
    insertChunk: vi.fn(async (chunk: { chunkHash: string }) => {
      insertedChunks.push(chunk)
    }),
  }
  return { embed, db, insertedChunks, insertedDocs }
}

const longText = [
  '## Цель',
  'я'.repeat(1200),
  '## Ход занятия. Этап 1',
  'е'.repeat(1200),
  '## Рефлексия',
  'о'.repeat(1200),
].join('\n\n')

describe('ingestDocument', () => {
  it('chunks, embeds only new chunks, and inserts them with doc metadata', async () => {
    const { embed, db, insertedChunks } = fakeDeps()
    const res = await ingestDocument(
      {
        source: 'seed',
        title: 'Тест',
        direction: 'Гражданское',
        gradeRange: '5-7',
        gradeMin: 5,
        gradeMax: 7,
        rawUrl: 'seed://test.md',
        text: longText,
        lang: 'russian',
      },
      { embed, db },
    )
    expect(res.inserted).toBeGreaterThan(0)
    expect(res.skipped).toBe(0)
    expect(embed).toHaveBeenCalledTimes(1)
    expect(insertedChunks[0].chunkHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('skips chunks whose hash already exists (idempotent)', async () => {
    const { embed: e1, db: db1 } = fakeDeps()
    await ingestDocument(
      {
        source: 'seed',
        title: 'Т',
        direction: null,
        gradeRange: '5-7',
        gradeMin: 5,
        gradeMax: 7,
        rawUrl: 'seed://t.md',
        text: longText,
        lang: 'russian',
      },
      { embed: e1, db: db1 },
    )
    const allHashes = db1.insertChunk.mock.calls.map((c) => c[0].chunkHash)

    const { embed: e2, db: db2 } = fakeDeps(allHashes)
    const res = await ingestDocument(
      {
        source: 'seed',
        title: 'Т',
        direction: null,
        gradeRange: '5-7',
        gradeMin: 5,
        gradeMax: 7,
        rawUrl: 'seed://t.md',
        text: longText,
        lang: 'russian',
      },
      { embed: e2, db: db2 },
    )
    expect(res.inserted).toBe(0)
    expect(res.skipped).toBe(allHashes.length)
    expect(e2).not.toHaveBeenCalled()
  })
})
