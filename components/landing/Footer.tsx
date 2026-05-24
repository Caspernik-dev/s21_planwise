import Image from 'next/image'
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
            <Link href="/" className="flex items-center" aria-label="Planwise — на главную">
              <Image
                src="/logo.svg"
                alt="Planwise — Классный час"
                width={148}
                height={44}
                className="h-11 w-auto"
              />
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
