import { Footer } from '@/components/landing/Footer'
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Сервис временно недоступен — Planwise',
  robots: { index: false, follow: false },
}

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <LandingNavbar />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-brand-100 bg-white p-10 shadow-card">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-warm-100 px-4 py-1.5 text-sm font-medium text-warm-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warm-500" />
              Технический перерыв
            </div>

            <h1 className="font-display text-3xl font-bold text-neutral-900 sm:text-4xl">
              Сервис временно недоступен
            </h1>

            <p className="mt-4 text-base text-neutral-700 sm:text-lg">
              Идёт подготовка к демонстрации. Личный кабинет ненадолго закрыт — мы скоро вернёмся.
            </p>

            <p className="mt-3 text-sm text-neutral-500">
              Если у вас уже есть приглашение и доступ — войдите под нужным аккаунтом.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-brand-800"
              >
                На главную
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-800 transition hover:bg-brand-50"
              >
                Войти
              </Link>
              <Link
                href="/changelog"
                className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                Что нового
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
