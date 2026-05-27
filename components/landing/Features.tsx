import { cn } from '@/lib/utils'
import {
  BookOpen,
  CalendarDays,
  FileDown,
  FileStack,
  History,
  Library,
  Radio,
  ShieldCheck,
} from 'lucide-react'

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Опора на методички',
    description:
      'Генерация с RAG над «Разговорами о важном» и проверенными эталонами сценариев — без выдуманных фактов.',
    accent: 'brand',
  },
  {
    icon: Radio,
    title: 'Генерация в реальном времени',
    description:
      'Сначала появляется структура занятия, затем детали по блокам — прямо на ваших глазах.',
    accent: 'accent',
  },
  {
    icon: FileStack,
    title: 'План воспитательной работы',
    description:
      'Загрузите план в PDF, DOCX, PPTX или TXT — система разберёт темы и подскажет следующую незакрытую.',
    accent: 'warm',
  },
  {
    icon: CalendarDays,
    title: 'Календарь поводов',
    description:
      'Значимые даты учебного года и привязка готового сценария к нужному дню в месячной сетке.',
    accent: 'neutral',
  },
  {
    icon: Library,
    title: 'Библиотека сообщества',
    description:
      'Семантический поиск по лучшим сценариям коллег — найдите подходящий и используйте как основу.',
    accent: 'brand',
  },
  {
    icon: History,
    title: 'Редактор и история версий',
    description:
      'Правьте блоки, меняйте их местами и регенерируйте активности, откатывайтесь к прежним версиям.',
    accent: 'accent',
  },
  {
    icon: ShieldCheck,
    title: 'Локальная защита ПДн',
    description:
      'Персональные данные обезличиваются локально. GigaChat получает только безопасный текст.',
    accent: 'warm',
  },
  {
    icon: FileDown,
    title: 'Экспорт и показ',
    description:
      'Выгрузка в PDF и DOCX, персональная ссылка для коллег и полноэкранный режим показа на проекторе.',
    accent: 'neutral',
  },
] as const

const ACCENT_ICON: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  accent: 'bg-accent-50 text-accent-600',
  warm: 'bg-warm-50 text-warm-600',
  neutral: 'bg-neutral-100 text-neutral-600',
}

export function Features() {
  return (
    <section id="features" className="bg-neutral-0 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <span className="inline-block rounded-full bg-brand-50 px-4 py-1 text-sm font-semibold text-brand-600 ring-1 ring-brand-200">
            Возможности
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            Всё для подготовки занятия
          </h2>
          <p className="mt-3 text-base text-neutral-500">
            От плана и методичек до готового занятия — редактирования, показа и экспорта
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="flex flex-col rounded-2xl bg-neutral-0 p-6 shadow-card ring-1 ring-neutral-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-hover"
              >
                <div
                  className={cn(
                    'mb-4 inline-flex w-fit rounded-xl p-3',
                    ACCENT_ICON[feature.accent],
                  )}
                >
                  <Icon size={22} />
                </div>
                <h3 className="mb-2 font-display text-lg font-bold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-500">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
