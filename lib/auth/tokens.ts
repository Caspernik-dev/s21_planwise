import { createHash, randomBytes } from 'node:crypto'

export type TokenKind = 'verify' | 'reset'

export type TokenStore = {
  insert: (row: {
    userId: string
    kind: TokenKind
    tokenHash: string
    expiresAt: Date
    usedAt: Date | null
  }) => Promise<void>
  findByHash: (
    hash: string,
    kind: TokenKind,
  ) => Promise<{
    id: string
    userId: string
    expiresAt: Date
    usedAt: Date | null
  } | null>
  markUsed: (id: string, at: Date) => Promise<void>
  invalidate: (userId: string, kind: TokenKind, at: Date) => Promise<void>
  cleanup: (olderThan: Date) => Promise<void>
}

export type TokenDeps = { store?: TokenStore; now?: Date }

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function generateRawToken(): string {
  return randomBytes(32).toString('base64url')
}

async function getStore(deps: TokenDeps): Promise<TokenStore> {
  if (deps.store) return deps.store
  const mod = await import('./tokens-store')
  return mod.dbTokenStore
}

export async function issueToken(
  userId: string,
  kind: TokenKind,
  ttlSeconds: number,
  deps: TokenDeps = {},
): Promise<{ token: string; expiresAt: Date }> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  await store.cleanup(new Date(now.getTime() - 7 * 86400_000)).catch(() => {})
  const token = generateRawToken()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  await store.insert({
    userId,
    kind,
    tokenHash: hashToken(token),
    expiresAt,
    usedAt: null,
  })
  return { token, expiresAt }
}

export async function consumeToken(
  rawToken: string,
  kind: TokenKind,
  deps: TokenDeps = {},
): Promise<{ userId: string } | null> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  const row = await store.findByHash(hashToken(rawToken), kind)
  if (!row) return null
  if (row.usedAt !== null) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null
  await store.markUsed(row.id, now)
  return { userId: row.userId }
}

export async function invalidateUserTokens(
  userId: string,
  kind: TokenKind,
  deps: TokenDeps = {},
): Promise<void> {
  const store = await getStore(deps)
  const now = deps.now ?? new Date()
  await store.invalidate(userId, kind, now)
}
