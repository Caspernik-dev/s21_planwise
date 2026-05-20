type SessionLike = { user?: { role?: string | null; [k: string]: unknown } | null } | null

export function isAdmin(session: SessionLike): boolean {
  return session?.user?.role === 'admin'
}
