import { searchSharedAction } from './actions'
import { LibrarySearch } from './search'

export default async function LibraryPage() {
  const initial = await searchSharedAction('')
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-neutral-900">Библиотека сообщества</h1>
      <p className="text-sm text-neutral-600">
        Готовые сценарии, которыми поделились коллеги. «Использовать как есть» создаёт вашу личную
        копию.
      </p>
      <LibrarySearch initial={initial} />
    </div>
  )
}
