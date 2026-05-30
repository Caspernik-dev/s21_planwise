import { db } from '@/db'
import { authTokens } from '@/db/schema'
import { and, eq, isNull, lt } from 'drizzle-orm'
import type { TokenKind, TokenStore } from './tokens'

export const dbTokenStore: TokenStore = {
  async insert(row) {
    await db.insert(authTokens).values({
      userId: row.userId,
      kind: row.kind,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    })
  },
  async findByHash(hash, kind) {
    const [r] = await db
      .select({
        id: authTokens.id,
        userId: authTokens.userId,
        expiresAt: authTokens.expiresAt,
        usedAt: authTokens.usedAt,
      })
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, kind)))
      .limit(1)
    return r ?? null
  },
  async markUsed(id, at) {
    await db.update(authTokens).set({ usedAt: at }).where(eq(authTokens.id, id))
  },
  async invalidate(userId, kind: TokenKind, at) {
    await db
      .update(authTokens)
      .set({ usedAt: at })
      .where(
        and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
      )
  },
  async cleanup(olderThan) {
    await db.delete(authTokens).where(lt(authTokens.expiresAt, olderThan))
  },
}
