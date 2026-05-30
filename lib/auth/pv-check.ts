export function needsPvRecheck(
  pvCheckedAt: number | undefined,
  nowSec: number,
  intervalSec: number,
): boolean {
  if (pvCheckedAt === undefined) return true
  return nowSec - pvCheckedAt >= intervalSec
}
