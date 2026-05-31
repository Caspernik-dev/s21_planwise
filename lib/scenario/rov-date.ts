/**
 * Helpers for РоВ (Разговоры о важном) lesson date handling.
 * All date parsing via UTC to avoid local-timezone weekday shifts.
 * No I/O, no Date.now(), no side effects.
 */

/** Parse YYYY-MM-DD string as UTC Date. Returns null for any invalid input. */
function parseUtc(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T00:00:00Z`)
  // getTime() is NaN for invalid dates like 2026-02-30
  if (Number.isNaN(d.getTime())) return null
  // Verify the parsed date matches the input (catches days like Feb 30 that roll over)
  const iso = d.toISOString().slice(0, 10)
  if (iso !== date) return null
  return d
}

/** Format a UTC Date as YYYY-MM-DD string. */
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Returns true iff the date string is a Monday (UTC). Never throws. */
export function isMonday(date: string): boolean {
  const d = parseUtc(date)
  return d !== null && d.getUTCDay() === 1
}

/**
 * Returns the nearest Monday to the given date (UTC) as YYYY-MM-DD.
 * Since 7 is odd, daysFromPrev + daysToNext = 7, so there are no ties.
 * Rule: pick previous Monday when daysFromPrev <= daysToNext, else next Monday.
 * For invalid input: returns the input unchanged (no throw).
 */
export function nearestMonday(date: string): string {
  const d = parseUtc(date)
  if (d === null) return date

  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  if (dow === 1) return date

  // Days since last Monday: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  const daysFromPrev = dow === 0 ? 6 : dow - 1
  const daysToNext = 7 - daysFromPrev

  if (daysFromPrev <= daysToNext) {
    return toYMD(new Date(d.getTime() - daysFromPrev * 86_400_000))
  }
  return toYMD(new Date(d.getTime() + daysToNext * 86_400_000))
}

/** Returns the first Monday of September for the given school year's start year. */
function firstMondayOfSeptember(year: number): Date {
  const sep1 = new Date(`${year}-09-01T00:00:00Z`)
  const dow = sep1.getUTCDay()
  // Days until next Monday (0 if sep1 is already Monday)
  const daysToMon = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow
  return new Date(sep1.getTime() + daysToMon * 86_400_000)
}

/**
 * Returns the РоВ lesson number (1..34) for a Monday date, or null.
 * Null is returned when:
 * - The date is not a Monday
 * - The input is malformed
 * - The computed lesson number is outside [1, 34]
 *
 * School year: starts on the first Monday of September.
 * If month >= 9, the year is the current year; otherwise it's the previous year.
 */
export function rovLessonNumber(date: string): number | null {
  const d = parseUtc(date)
  if (d === null) return null
  if (d.getUTCDay() !== 1) return null

  const month = d.getUTCMonth() + 1 // 1..12
  const year = d.getUTCFullYear()
  const schoolYearStart = month >= 9 ? year : year - 1

  const firstMonday = firstMondayOfSeptember(schoolYearStart)
  const diffMs = d.getTime() - firstMonday.getTime()
  if (diffMs < 0) return null

  const weekIndex = Math.round(diffMs / 86_400_000 / 7)
  const lessonNumber = weekIndex + 1
  return lessonNumber >= 1 && lessonNumber <= 34 ? lessonNumber : null
}

/**
 * Returns a Russian locale formatted date string like «понедельник, 7 сентября 2026».
 * Strips the trailing " г." suffix that Node's Intl appends and lowercases the weekday.
 * For malformed input: returns the input string unchanged (no throw).
 */
export function formatLessonDateRu(date: string): string {
  const d = parseUtc(date)
  if (d === null) return date

  let formatted = d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Strip trailing " г." suffix present in Node.js Intl output
  formatted = formatted.replace(/\s*г\.$/, '').trimEnd()

  // Ensure weekday is lowercase (some Intl implementations capitalize)
  return formatted.charAt(0).toLowerCase() + formatted.slice(1)
}
