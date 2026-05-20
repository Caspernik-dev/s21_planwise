import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { eq } from 'drizzle-orm'

async function main() {
  const email = process.argv[2]?.toLowerCase().trim()
  if (!email) {
    console.error('Использование: pnpm set:admin <email>')
    process.exit(1)
  }
  // Динамический импорт ПОСЛЕ config(): @/db конструирует postgres-клиент на этапе
  // загрузки модуля, а ESM-импорты хойстятся выше config() — поэтому грузим лениво.
  const { db } = await import('@/db')
  const { users } = await import('@/db/schema')
  const res = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email })
  if (res.length === 0) {
    console.error(`Пользователь не найден: ${email}`)
    process.exit(1)
  }
  console.log(`Назначен админом: ${res[0].email} (id=${res[0].id})`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
