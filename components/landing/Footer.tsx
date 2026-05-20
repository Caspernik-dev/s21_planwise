import Link from 'next/link'

const LINKS = [
  { label: 'Возможности', href: '#features' },
  { label: 'Войти', href: '/login' },
  { label: 'Регистрация', href: '/register' },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-neutral-200 bg-neutral-0">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link
              href="/"
              className="flex items-center gap-2 font-display text-xl font-bold text-neutral-900"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">
                К
              </span>
              Классный<span className="text-brand-500">час</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              ИИ-генератор сценариев внеурочных занятий с опорой на методички и эталоны сообщества.
              Персональные данные обезличиваются локально.
            </p>
          </div>

          <nav className="flex flex-col gap-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-neutral-100 pt-6">
          <p className="text-xs text-neutral-400">© {year}, «Классный час». Хакатонный проект.</p>
        </div>
      </div>
    </footer>
  )
}
