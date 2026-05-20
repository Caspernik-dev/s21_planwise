import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'

// Next.js грузит .env.local автоматически, но этот standalone-скрипт — нет.
// Грузим .env.local (приоритет), затем .env как fallback.
config({ path: '.env.local' })
config()

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  console.log('Applying migrations...')
  await migrate(db, { migrationsFolder: './db/migrations' })
  console.log('Done.')
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
