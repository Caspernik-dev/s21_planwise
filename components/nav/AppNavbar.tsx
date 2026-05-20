import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AppNavbar({
  userName,
  userEmail,
  role,
}: { userName?: string | null; userEmail: string; role?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/app" className="text-base font-display font-semibold text-neutral-900">
          Классный час
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-600">
          <Link href="/app/new" className="hover:text-neutral-900">
            Создать
          </Link>
          <Link href="/app/library" className="hover:text-neutral-900">
            Библиотека
          </Link>
          <Link href="/app/plans" className="hover:text-neutral-900">
            Планы
          </Link>
          <Link href="/app/calendar" className="hover:text-neutral-900">
            Календарь
          </Link>
          {role === 'admin' && (
            <Link href="/app/admin" className="hover:text-neutral-900">
              Админ
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">{userName ?? userEmail}</span>
          <form action="/app/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Выйти
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
