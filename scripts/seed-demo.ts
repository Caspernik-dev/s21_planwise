import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { eq } from 'drizzle-orm'

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@klassniychas.ru'
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo12345'

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1)
  if (existing) {
    console.log(`Демо-аккаунт уже существует: ${DEMO_EMAIL} (id=${existing.id})`)
    process.exit(0)
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: 'Демо-педагог', passwordHash })
    .returning({ id: users.id })

  console.log(`Создан демо-аккаунт: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (id=${user?.id})`)
  console.log(
    `Добавьте ${DEMO_EMAIL} в DEMO_USER_EMAILS в .env.local, чтобы снять лимиты генерации.`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
