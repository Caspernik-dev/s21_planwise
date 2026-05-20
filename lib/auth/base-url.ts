import { headers } from 'next/headers'

/** Чистая сборка базового URL из host/proto с fallback на env/localhost. */
export function baseUrlFrom(
  host: string | null,
  proto: string | null,
  envUrl: string | undefined = process.env.AUTH_URL,
): string {
  if (host) return `${proto ?? 'http'}://${host}`
  return envUrl ?? 'http://localhost:3000'
}

/** Серверный хелпер: derive базового URL из заголовков текущего запроса. */
export async function baseUrlFromRequest(): Promise<string> {
  const h = await headers()
  return baseUrlFrom(h.get('host'), h.get('x-forwarded-proto'))
}
