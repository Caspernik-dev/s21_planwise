import { ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

const STATS = [
  { value: '8 форматов', label: 'от беседы до дебатов' },
  { value: 'RAG', label: 'опора на методички' },
  { value: 'PDF · DOCX', label: 'и ссылка для коллег' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-neutral-0">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 20%, #edfbf4 0%, transparent 50%),' +
            'radial-gradient(circle at 10% 80%, #e8f0ff 0%, transparent 50%)',
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 pb-20 pt-16 text-center sm:px-6 lg:px-8 lg:pt-24">
        <div className="animate-fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
            <Sparkles size={14} className="text-brand-500" />
            ИИ-генератор · Разговоры о важном
          </div>

          <h1 className="mb-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            Сценарий классного часа за <span className="text-brand-500">минуту</span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-neutral-500">
            Генерация с опорой на методички «Разговоров о важном» и эталоны сообщества. Задайте тему
            вручную, возьмите из плана воспитательной работы или календаря поводов. Персональные
            данные обезличиваются локально — во внешний сервис уходит только безопасный текст.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-7 py-3 text-base font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
            >
              Начать бесплатно
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl border border-neutral-300 px-7 py-3 text-base font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Войти
            </Link>
          </div>

          <div className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-neutral-50 p-4 text-center ring-1 ring-neutral-200"
              >
                <p className="font-display text-xl font-extrabold text-brand-500">{stat.value}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
