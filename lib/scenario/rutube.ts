/**
 * Утилиты для работы с видеороликами в РоВ-сценариях.
 * Поиск ведётся через RuTube; прямые URL заменяются маркером.
 */

export const VIDEO_PLACEHOLDER = '[Просмотр ролика]'

/**
 * Заменяет прямые ссылки на видеоролики на маркер VIDEO_PLACEHOLDER.
 * Не трогает поисковые URL вида https://rutube.ru/search/?query=...
 *
 * Паттерны для замены:
 *   - https?://(www.)?rutube.ru/video/{что-угодно без пробела}
 *   - https?://(www.)?youtube.com/watch?...
 *   - https?://youtu.be/{что-угодно без пробела}
 */
export function sanitizeRutubeText(text: string): string {
  // rutube.ru/video/... — прямая ссылка (НЕ /search/)
  const rutubeVideo = /https?:\/\/(?:www\.)?rutube\.ru\/video\/\S*/g
  // youtube.com/watch?...
  const youtubeWatch = /https?:\/\/(?:www\.)?youtube\.com\/watch\S*/g
  // youtu.be/...
  const youtubeBe = /https?:\/\/youtu\.be\/\S*/g

  return text
    .replace(rutubeVideo, VIDEO_PLACEHOLDER)
    .replace(youtubeWatch, VIDEO_PLACEHOLDER)
    .replace(youtubeBe, VIDEO_PLACEHOLDER)
}

/**
 * Формирует поисковый URL на RuTube для заданного запроса.
 */
export function buildSearchUrl(query: string): string {
  return `https://rutube.ru/search/?query=${encodeURIComponent(query.trim())}`
}

/**
 * Собирает запрос для поиска видео из темы, направления и ведущей ценности.
 * Пустые/undefined части пропускаются.
 * Обрезает до 80 символов по последнему пробелу (не разрывает слова), иначе жёсткий срез.
 */
export function fallbackSearchQuery(
  topic: string,
  direction: string | undefined,
  leadingValue: string | undefined,
): string {
  const parts = [topic, direction, leadingValue].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  const joined = parts.join(' ')

  if (joined.length <= 80) return joined

  // Срез по последнему пробелу внутри первых 80 символов
  const truncated = joined.slice(0, 80)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
}

interface VideoActivity {
  type: string
  text: string
  videoSearchQuery?: string
}

interface VideoCtx {
  topic: string
  direction: string | undefined
  leadingValue: string | undefined
}

/**
 * Извлекает поисковый запрос для видео-активности:
 * - Не video-тип → undefined.
 * - Есть непустой videoSearchQuery, не похожий на URL → вернуть его (trimmed).
 * - Иначе → fallbackSearchQuery(topic, direction, leadingValue).
 */
export function extractOrFallbackQuery(activity: VideoActivity, ctx: VideoCtx): string | undefined {
  if (activity.type !== 'video') return undefined

  const q = (activity.videoSearchQuery ?? '').trim()
  if (q.length > 0 && !q.startsWith('http://') && !q.startsWith('https://')) {
    return q
  }

  return fallbackSearchQuery(ctx.topic, ctx.direction, ctx.leadingValue)
}
