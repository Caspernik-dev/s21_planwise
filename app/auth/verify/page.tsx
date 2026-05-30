import { db } from '@/db'
import { users } from '@/db/schema'
import { consumeToken } from '@/lib/auth/tokens'
import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Search = { token?: string }

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { token } = await searchParams
  if (!token) {
    return <ErrorCard message="Ссылка без токена. Попросите новую в личном кабинете." />
  }

  const result = await consumeToken(token, 'verify')
  if (!result) {
    return (
      <ErrorCard message="Ссылка недействительна или истекла. Войдите и нажмите «Отправить ещё раз»." />
    )
  }

  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(and(eq(users.id, result.userId), isNull(users.emailVerified)))

  redirect('/app?verified=1')
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-card p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-3">Подтверждение email</h1>
        <p className="text-neutral-700 mb-6">{message}</p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors"
        >
          На страницу входа
        </Link>
      </div>
    </div>
  )
}
