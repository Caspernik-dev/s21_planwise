import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import fs from 'node:fs'
import path from 'node:path'
import { embed } from '@/lib/gigachat/embeddings'
import { ingestDocument } from '@/lib/rag/ingest'
import pdf from 'pdf-parse'

const MATERIALS_DIR = path.join(process.cwd(), 'materials')
const LANG = process.env.PG_TSV_LANG ?? 'russian'

// null = пропустить (нормативный документ, не методический)
function getLessonType(filename: string): string | null {
  const f = filename.toLowerCase()
  if (/^фгос |^фоп |^сан-эпид/.test(f)) return null
  if (/разговоры|мои горизонты|профориентац/.test(f)) return 'rov'
  if (/pvd_matemat|пвд.*(биолог|физик|хими|математик|инф культ)/.test(f)) return 'subject_extension'
  if (/обучение служением/.test(f)) return 'event'
  if (/программа вуд|программа_край|рабочая программа|рп курса|пфк/.test(f)) return 'krujok'
  if (/^пвд_/.test(f)) return 'krujok'
  return 'krujok'
}

async function main() {
  const { drizzleIngestDb } = await import('@/lib/rag/ingest-db')

  const files = fs.readdirSync(MATERIALS_DIR).filter((f) => f.endsWith('.pdf'))
  console.log(`Найдено ${files.length} PDF файлов`)

  let ingested = 0
  let skipped = 0

  for (const filename of files) {
    const lessonType = getLessonType(filename)
    if (!lessonType) {
      console.log(`  SKIP (нормативный): ${filename}`)
      skipped++
      continue
    }

    const filepath = path.join(MATERIALS_DIR, filename)
    const buffer = fs.readFileSync(filepath)

    let text: string
    try {
      const data = await pdf(buffer)
      text = data.text.trim()
    } catch (e) {
      console.error(`  ERROR парсинг PDF: ${filename}`, e)
      continue
    }

    if (text.length < 200) {
      console.log(`  SKIP (мало текста): ${filename}`)
      skipped++
      continue
    }

    try {
      const result = await ingestDocument(
        {
          source: 'materials',
          title: filename.replace('.pdf', ''),
          direction: null,
          gradeRange: null,
          gradeMin: null,
          gradeMax: null,
          rawUrl: `materials://${filename}`,
          text,
          lang: LANG,
          extraMeta: { lesson_type: lessonType },
        },
        { embed, db: drizzleIngestDb },
      )
      console.log(
        `  OK [${lessonType}] +${result.inserted} чанков (skip=${result.skipped}): ${filename}`,
      )
      ingested++
    } catch (e) {
      console.error(`  ERROR ingest: ${filename}`, e)
    }
  }

  console.log(`\nГотово: ingested=${ingested}, skipped=${skipped}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
