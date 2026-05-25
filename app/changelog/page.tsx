import { Footer } from '@/components/landing/Footer'
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import { CHANGELOG, CHANGE_KIND_LABEL, type ChangeKind } from '@/lib/changelog'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Что нового — Planwise',
  description: 'История изменений сервиса Planwise: новые функции, улучшения и исправления.',
}

const KIND_BADGE: Record<ChangeKind, string> = {
  feature: 'bg-brand-100 text-brand-800',
  fix: 'bg-warm-100 text-warm-800',
  improvement: 'bg-accent-100 text-accent-800',
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <LandingNavbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <header className="mb-12">
          <h1 className="font-display text-3xl font-semibold text-neutral-900 sm:text-4xl">
            Что нового
          </h1>
          <p className="mt-3 text-base leading-relaxed text-neutral-500">
            История изменений сервиса: новые функции, улучшения и исправления.
          </p>
        </header>

        <ol className="space-y-10">
          {CHANGELOG.map((entry) => (
            <li
              key={entry.version}
              className="rounded-lg bg-neutral-0 p-6 shadow-card ring-1 ring-neutral-200/70"
            >
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-display text-lg font-semibold text-brand-700">
                  {entry.version}
                </span>
                <span className="text-sm text-neutral-400">{entry.date}</span>
              </div>
              <ul className="space-y-3">
                {entry.changes.map((change) => (
                  <li key={change.text} className="flex items-start gap-3">
                    <span
                      className={`flex h-6 w-24 shrink-0 items-center justify-center rounded-full text-xs font-medium ${KIND_BADGE[change.kind]}`}
                    >
                      {CHANGE_KIND_LABEL[change.kind]}
                    </span>
                    <span className="text-sm leading-6 text-neutral-700">{change.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </div>
  )
}
