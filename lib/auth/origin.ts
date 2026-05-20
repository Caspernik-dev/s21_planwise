import { headers } from 'next/headers'

/** Чистая проверка: host из Origin совпадает с Host запроса. */
export function isSameOrigin(originHeader: string | null, hostHeader: string | null): boolean {
  if (!originHeader || !hostHeader) return false
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}

/** Серверный хелпер: читает заголовки запроса и проверяет same-origin. */
export async function assertSameOrigin(): Promise<boolean> {
  const h = await headers()
  return isSameOrigin(h.get('origin'), h.get('host'))
}
