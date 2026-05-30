import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const { db } = await import('../db')
  const { sql } = await import('drizzle-orm')

  const r1 = await db.execute(sql`
    UPDATE rag_documents SET lesson_type = 'rov'
    WHERE lesson_type IS NULL AND source IN ('razgovor', 'seed')
  `)
  console.log(`Updated razgovor+seed → rov: ${(r1 as any).rowCount ?? (r1 as any).count ?? '?'}`)

  const left = await db.execute(sql`
    SELECT source, count(*)::int AS n FROM rag_documents
    WHERE lesson_type IS NULL
    GROUP BY source
    ORDER BY n DESC
  `)
  const rows = (left as any).rows ?? left
  if (rows.length === 0) {
    console.log('Осталось без lesson_type: 0 (все заполнены)')
  } else {
    console.log('Осталось без lesson_type:')
    for (const row of rows) {
      console.log(`  ${row.source}: ${row.n}`)
    }
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
