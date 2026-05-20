export function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

export function isWhitelisted(
  email: string | null | undefined,
  demoEmails: string | undefined,
): boolean {
  if (!email) return false
  const set = (demoEmails ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return set.includes(email.toLowerCase())
}
