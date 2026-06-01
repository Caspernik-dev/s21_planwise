import { Users } from 'lucide-react'
import { searchSharedAction } from './actions'
import { LibrarySearch } from './search'

export default async function LibraryPage() {
  const initial = await searchSharedAction('')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-neutral-900">Библиотека сообщества</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Готовые сценарии, которыми поделились коллеги. «Использовать как есть» создаёт вашу личную
          копию — оригинал не меняется.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <Users aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div className="text-sm text-brand-900">
          Семантический поиск работает по смыслу, не только по словам. Например, запрос «командная
          работа» найдёт сценарии про сотрудничество, дружбу и совместные проекты.
        </div>
      </div>

      <LibrarySearch initial={initial} />
    </div>
  )
}
