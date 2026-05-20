import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { embed } from '@/lib/gigachat/embeddings'
import { ingestDocument } from '@/lib/rag/ingest'
import matter from 'gray-matter'

const DIR = join(process.cwd(), 'content', 'seed-scenarios')
const LANG = process.env.PG_TSV_LANG ?? 'russian'

async function main() {
  // Ленивый импорт после config(): @/lib/rag/ingest-db тянет @/db (postgres-клиент
  // на этапе загрузки модуля), а ESM-импорты хойстятся выше config().
  const { drizzleIngestDb } = await import('@/lib/rag/ingest-db')
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.md'))
  let totalInserted = 0
  let totalSkipped = 0

  for (const file of files) {
    const raw = await readFile(join(DIR, file), 'utf8')
    const { data, content } = matter(raw)
    const res = await ingestDocument(
      {
        source: 'seed',
        title: String(data.title ?? file),
        direction: data.direction ? String(data.direction) : null,
        gradeRange: data.grade_range ? String(data.grade_range) : null,
        gradeMin: Number(data.grade_min ?? 1),
        gradeMax: Number(data.grade_max ?? 11),
        rawUrl: `seed://${file}`,
        text: content,
        lang: LANG,
      },
      { embed, db: drizzleIngestDb },
    )
    totalInserted += res.inserted
    totalSkipped += res.skipped
    console.log(`${file}: +${res.inserted} chunks, skipped ${res.skipped}`)
  }

  console.log(`\nИтого: вставлено ${totalInserted}, пропущено ${totalSkipped}.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
