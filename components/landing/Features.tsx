import { cn } from '@/lib/utils'
import { BookOpen, FileDown, Radio, ShieldCheck } from 'lucide-react'

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
    title: 'Двухэтапный стрим',
    description:
      'Сначала появляется структура занятия, затем детали — в реальном времени, прямо на ваших глазах.',
    accent: 'accent',
  },
  {
    icon: ShieldCheck,
    title: 'Локальная защита ПДн',
    description:
      'Персональные данные детектятся и обезличиваются локально. GigaChat получает только обезличенный текст.',
    accent: 'warm',
  },
  {
    icon: FileDown,
    title: 'Экспорт в PDF и DOCX',
    description:
      'Готовый сценарий выгружается в один клик — печатайте или редактируйте в привычном формате.',
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
            От поиска по методичкам до готового файла для печати
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
