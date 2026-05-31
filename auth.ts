import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyPassword } from '@/lib/auth/password'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: string
      emailVerified: Date | null
    } & DefaultSession['user']
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' }, // JWT — проще, не требует таблицы sessions для caching
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .toLowerCase()
          .trim()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user || !user.passwordHash) return null

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null

        const { logEvent } = await import('@/lib/events/log')
        await logEvent('login', { userId: user.id })

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          passwordVersion: user.passwordVersion,
          emailVerified: user.emailVerified ?? null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const intervalSec = Number(process.env.PV_CHECK_INTERVAL_SEC ?? '60')
      const nowSec = Math.floor(Date.now() / 1000)
      if (user) {
        const u = user as {
          id: string
          role?: string
          passwordVersion?: number
          emailVerified?: Date | null
        }
        token.id = u.id
        token.role = u.role ?? 'user'
        token.passwordVersion = u.passwordVersion ?? 1
        token.emailVerified = u.emailVerified ? u.emailVerified.toISOString() : null
        token.pvCheckedAt = nowSec
        return token
      }
      const { needsPvRecheck } = await import('@/lib/auth/pv-check')
      if (needsPvRecheck(token.pvCheckedAt as number | undefined, nowSec, intervalSec)) {
        if (!token.id) return token
        const { db } = await import('@/db')
        const { users } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [row] = await db
          .select({ pv: users.passwordVersion, ev: users.emailVerified })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1)
        if (!row) return null
        const tokenPv = token.passwordVersion as number | undefined
        if (tokenPv === undefined) {
          // legacy-токен (выдан до того, как passwordVersion попал в JWT) — бэкфилл, не инвалидируем
          token.passwordVersion = row.pv
        } else if (row.pv !== tokenPv) {
          return null
        }
        token.emailVerified = row.ev ? row.ev.toISOString() : null
        token.pvCheckedAt = nowSec
      }
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      session.user.role = (token.role as string) ?? 'user'
      const ev = token.emailVerified as string | null | undefined
      session.user.emailVerified = ev ? new Date(ev) : null
      return session
    },
  },
})
