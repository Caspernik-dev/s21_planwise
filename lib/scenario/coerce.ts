// GigaChat иногда выдаёт type активности вне нашего enum (presentation, group_work, «беседа»…).
// Без нормализации это валит zod-валидацию → «невалидный сценарий». Маппим к пяти разрешённым.
const ALLOWED = ['discussion', 'quiz', 'game', 'task', 'video'] as const

const MAP: Record<string, (typeof ALLOWED)[number]> = {
  presentation: 'video',
  slides: 'video',
  слайды: 'video',
  презентация: 'video',
  видео: 'video',
  group_work: 'task',
  groupwork: 'task',
  practical: 'task',
  practice: 'task',
  практическое: 'task',
  задание: 'task',
  lecture: 'discussion',
  conversation: 'discussion',
  talk: 'discussion',
  беседа: 'discussion',
  обсуждение: 'discussion',
  рефлексия: 'discussion',
  игра: 'game',
  викторина: 'quiz',
  квиз: 'quiz',
}

export function coerceActivityType(type: unknown): string {
  if (typeof type !== 'string') return 'discussion'
  const low = type.toLowerCase().trim()
  if ((ALLOWED as readonly string[]).includes(low)) return low
  return MAP[low] ?? 'discussion'
}

// Нормализует все activity.type внутри объекта сценария (мутирует и возвращает его же).
export function coerceContentTypes<T>(obj: T): T {
  const o = obj as { stages?: Array<{ activities?: Array<{ type?: unknown }> }> }
  if (o && Array.isArray(o.stages)) {
    for (const stage of o.stages) {
      if (stage && Array.isArray(stage.activities)) {
        for (const act of stage.activities) {
          if (act && typeof act === 'object') act.type = coerceActivityType(act.type)
        }
      }
    }
  }
  return obj
}
