'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const NAV_LINKS = [
  { label: 'Возможности', href: '#features' },
  { label: 'Как работает', href: '#how' },
  { label: 'Для кого', href: '#audience' },
]

export function LandingNavbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200/80 bg-neutral-0/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-neutral-900"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">
            К
          </span>
          Классный<span className="text-brand-500">час</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-md px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 sm:inline-flex"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
          >
            Начать
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={open}
            className="inline-flex items-center justify-center rounded-md p-2 text-neutral-700 transition-colors hover:bg-neutral-100 md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-neutral-200/80 bg-neutral-0/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 sm:hidden"
            >
              Войти
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
