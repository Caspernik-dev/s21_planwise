import { auth } from '@/auth'
import { CopyToMyAccount } from '@/components/share/CopyToMyAccount'
import { ScenarioReadOnly } from '@/components/share/ScenarioReadOnly'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { buildScenarioDocument } from '@/lib/export/document-model'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

async function loadByToken(token: string) {
  const [row] = await db.select().from(scenarios).where(eq(scenarios.shareToken, token)).limit(1)
  return row ?? null
}

export async function generateMetadata({
  params,
}: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const row = await loadByToken(token)
  return { title: row ? `${row.content.title} — Planwise` : 'Сценарий — Planwise' }
}

export default async function SharedScenarioPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await loadByToken(token)
  if (!row) notFound()

  const blocks = buildScenarioDocument(row.content, {
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

  const session = await auth()

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-0 px-6 py-3">
        <Link href="/" className="flex items-center" aria-label="Planwise">
          <Image src="/logo.svg" alt="Planwise — Классный час" width={150} height={36} priority />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/register">Создать свой сценарий</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/share/${token}/export?format=pdf`}>Скачать PDF</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/share/${token}/export?format=docx`}>Скачать DOCX</a>
          </Button>
          {session?.user?.id && <CopyToMyAccount token={token} />}
        </div>

        <ScenarioReadOnly blocks={blocks} />

        <footer className="mt-10 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-500">
          Создано в{' '}
          <Link href="/" className="text-brand-600 hover:underline">
            Planwise — Классный час
          </Link>
          .{' '}
          <Link href="/register" className="text-brand-600 hover:underline">
            Сгенерируйте свой сценарий за минуту →
          </Link>
        </footer>
      </main>
    </div>
  )
}
