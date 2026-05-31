import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

// max — параллельные коннекты в пуле. RSC-prefetch навбара легко делает 10+
// одновременных запросов, плюс SSE-роуты держат коннект до конца стрима.
// connect_timeout — быстрее отказывать чем висеть до nginx 504.
// idle_timeout — закрывать неиспользуемые коннекты, чтобы пул не «забывал» о них.
const client = postgres(url, {
  max: Number(process.env.DATABASE_MAX_POOL ?? '25'),
  connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_SEC ?? '10'),
  idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT_SEC ?? '30'),
})

export const db = drizzle(client, { schema })
export type DB = typeof db
