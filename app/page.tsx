import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 ring-1 ring-brand-200">
          MVP · хакатон
        </span>
        <h1 className="mt-6 text-5xl font-semibold text-neutral-900">
          Классный час за 30 секунд
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          ИИ-генератор сценариев внеурочной деятельности с опорой на методички и
          лайки сообщества.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/register"
            className="rounded-md bg-brand-500 px-6 py-3 text-white shadow-brand hover:bg-brand-600 transition"
          >
            Начать
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-neutral-0 px-6 py-3 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
          >
            Войти
          </Link>
        </div>
      </div>
    </main>
  )
}
